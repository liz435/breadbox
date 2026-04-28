// ── AVR SketchRunner ──────────────────────────────────────────────────────
//
// SketchRunner implementation backed by avr8js (ATmega328P on Uno/Nano; also
// used best-effort for ATmega2560 on Mega). Compiles via arduino-cli on the
// backend, loads the resulting hex into the emulator, wires port edges and
// serial bytes through to the shared pin store + peripheral bus.
//
// Extracted from the former `createArduinoVM` monolith.

import { sketchSizeRef } from "../sketch-size-ref"
import { createAVRRunner, arduinoPinToPort, portToArduinoPin, type AVRRunner } from "../avr-runner"
import { compileSketch } from "../avr-compiler"
import { PinState } from "avr8js"
import { pinStateStore, type PinStateStore } from "../pin-state-store"
import { PeripheralBus, type PeripheralBoardInput } from "../peripherals/peripheral-bus"
import { MAX_ARDUINO_PIN, type BoardTargetInfo } from "@dreamer/schemas"
import type {
  CustomLibraryMap,
  PinSnapshot,
  RunnerKind,
  SketchRunner,
  SketchRunnerCallbacks,
  SketchRunnerLoadOptions,
} from "./sketch-runner"

// 16 MHz / 60 fps ~ 266,667 cycles per frame for real-time execution.
const AVR_CYCLES_PER_FRAME = Math.round(16_000_000 / 60)

// Cycles run between scheduled-edge flushes. 160 cycles = 10µs of simulated
// MCU time — fine enough for HC-SR04 (58µs/cm echo), DHT bit timing (26 vs
// 70µs), and NEC IR (562µs minimum). Coarser resolution would corrupt DHT
// bit reads near the HIGH-duration threshold.
const SCHEDULER_STEP_CYCLES = 160

export function createAvrSketchRunner(
  target: BoardTargetInfo,
  callbacks: SketchRunnerCallbacks,
  store: PinStateStore = pinStateStore,
): SketchRunner {
  const kind: RunnerKind = "avr"
  const fqbn = target.fqbn

  // ── Peripheral bus (owned per-runner) ──────────────────────────────
  const peripheralBus = new PeripheralBus()

  // ── AVR runner state ───────────────────────────────────────────────
  let avrRunner: AVRRunner | null = null

  function getMillis(): number {
    if (!avrRunner) return 0
    return Math.floor((avrRunner.getCycleCount() / avrRunner.getFrequencyHz()) * 1000)
  }

  // ── Serial line buffering ──────────────────────────────────────────
  //
  // Serial output from avr8js arrives one byte at a time. Forwarding each
  // byte straight to callbacks.onSerialPrint causes the Serial Monitor to
  // create one timestamped entry per character. Buffer into lines and flush
  // on newline (or a short idle for Serial.print without trailing newline).
  const SERIAL_IDLE_FLUSH_MS = 200
  let avrSerialBuffer = ""
  let avrSerialIdleTimer: ReturnType<typeof setTimeout> | null = null

  function flushAvrSerial(): void {
    if (avrSerialIdleTimer) {
      clearTimeout(avrSerialIdleTimer)
      avrSerialIdleTimer = null
    }
    if (avrSerialBuffer.length === 0) return
    const out = avrSerialBuffer
    avrSerialBuffer = ""
    callbacks.onSerialPrint(out)
  }

  function handleAvrSerialByte(char: string): void {
    avrSerialBuffer += char
    if (char === "\n") {
      flushAvrSerial()
      return
    }
    if (avrSerialIdleTimer) clearTimeout(avrSerialIdleTimer)
    avrSerialIdleTimer = setTimeout(flushAvrSerial, SERIAL_IDLE_FLUSH_MS)
  }

  // ── Peripheral tick ────────────────────────────────────────────────
  //
  // Peripherals run their own silence-timeout / duration housekeeping. We
  // tick them at 20Hz so state changes surface in roughly real time.
  let peripheralTickHandle: ReturnType<typeof setInterval> | null = null

  function startPeripheralTick(): void {
    if (peripheralTickHandle) return
    peripheralTickHandle = setInterval(() => {
      peripheralBus.tick(getMillis())
    }, 50)
  }

  function stopPeripheralTick(): void {
    if (peripheralTickHandle) {
      clearInterval(peripheralTickHandle)
      peripheralTickHandle = null
    }
  }

  function createAVRRunnerInstance(): AVRRunner {
    startPeripheralTick()
    const runner = createAVRRunner({
      onPinChange: (port, pin, state) => {
        const arduinoPin = portToArduinoPin(port, pin)
        if (arduinoPin === null) return

        // Logical pin level: High/Low reflect output drive; InputPullUp
        // floats HIGH (avr-runner forces setPin(true) on the enum flip);
        // Input floats LOW by default.
        const digitalValue: 0 | 1 =
          state === PinState.High || state === PinState.InputPullUp ? 1 : 0

        const isOutput = state === PinState.High || state === PinState.Low
        if (isOutput) {
          store.writeFromSketch(arduinoPin, {
            digitalValue,
            mode: "OUTPUT",
          })
        } else {
          // Input pin: the sketch just called pinMode(..., INPUT | INPUT_PULLUP).
          // Mirror the mode into the store so UI components can react.
          store.writeFromSketch(arduinoPin, {
            mode: state === PinState.InputPullUp ? "INPUT_PULLUP" : "INPUT",
          })
        }

        // Dispatch to peripherals on EVERY state transition (output drive
        // flip OR mode change). DhtPeripheral needs to see "sketch held LOW
        // then released to INPUT_PULLUP" as a rising edge to know the data
        // request is complete; IrReceiver/Servo/Buzzer don't care about mode
        // changes on their pins because sketches drive them as OUTPUT.
        //
        // Simulated MCU time (cycles → ms). Wall-clock would collapse a
        // 20ms servo frame into ~1ms because the AVR simulates 16ms of
        // MCU time in ~1ms of real JS time.
        const simMs = (runner.getCycleCount() / runner.getFrequencyHz()) * 1000
        peripheralBus.dispatchEdge({
          pin: arduinoPin,
          value: digitalValue,
          simMs,
          source: "avr",
        })
      },
      onSerialOutput: (char) => {
        handleAvrSerialByte(char)
      },
      readAnalogInput: (pin) => store.readAnalog(pin),
    })
    // Forward external input-pin writes (button press, sensor sim) into the
    // emulator so digitalRead() actually sees them. Without this, writes
    // only update the store's UI mirror and the AVR keeps reading stale.
    store.setExternalPinSink((pin, digitalValue) => {
      if (!avrRunner) return
      const mapped = arduinoPinToPort(pin)
      if (!mapped) return
      avrRunner.setExternalPin(mapped.port, mapped.pin, digitalValue === 1)
    })
    return runner
  }

  async function loadSketchAsync(
    code: string,
    customLibraries?: CustomLibraryMap,
    options?: SketchRunnerLoadOptions,
  ): Promise<{ success: boolean; error?: string }> {
    reset()

    const backendLibs: Record<string, { name: string; code: string; description: string }> = {}
    if (customLibraries) {
      for (const [name, codeBody] of Object.entries(customLibraries)) {
        backendLibs[name] = { name, code: codeBody, description: "" }
      }
    }

    const result = await compileSketch(code, {
      fqbn: options?.fqbn ?? fqbn,
      customLibraries: backendLibs,
      onLog: options?.onLog,
    })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    if (result.format !== "hex") {
      return {
        success: false,
        error: `AVR runner received firmware in "${result.format}" format; expected "hex". Check the fqbn (${options?.fqbn ?? fqbn}).`,
      }
    }

    if (result.sizeInfo) {
      sketchSizeRef.current = { ...result.sizeInfo, source: "actual", ts: Date.now() }
    }

    avrRunner = createAVRRunnerInstance()
    avrRunner.load(result.hex)
    return { success: true }
  }

  /**
   * Execution is broken into SCHEDULER_STEP_CYCLES chunks so peripherals
   * that schedule future pin edges (UltrasonicPeripheral echo, DHT frame,
   * IR NEC envelope) fire at microsecond precision instead of whole-frame
   * coarseness.
   */
  function executeChunked(totalCycles: number): void {
    if (!avrRunner) return
    let remaining = totalCycles
    while (remaining > 0) {
      const step = Math.min(SCHEDULER_STEP_CYCLES, remaining)
      avrRunner.execute(step)
      const simMs = (avrRunner.getCycleCount() / avrRunner.getFrequencyHz()) * 1000
      peripheralBus.flushScheduledEdges(simMs)
      remaining -= step
    }
  }

  function runSetup(): void {
    if (!avrRunner) return
    try {
      executeChunked(800_000) // ~50ms at 16 MHz — long enough for typical setup()
    } catch (err) {
      callbacks.onError(err instanceof Error ? err.message : "Runtime error during AVR setup")
    }
  }

  function runLoopIteration(): boolean {
    if (!avrRunner) return true
    try {
      executeChunked(AVR_CYCLES_PER_FRAME)
    } catch (err) {
      callbacks.onError(err instanceof Error ? err.message : "Runtime error in AVR execution")
      return false
    }
    return true
  }

  function getPinState(pin: number): PinSnapshot {
    if (pin < 0 || pin > MAX_ARDUINO_PIN) {
      return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    }
    if (!avrRunner) {
      return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    }
    const mapped = arduinoPinToPort(pin)
    if (!mapped) return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    const pinState = avrRunner.getPin(mapped.port, mapped.pin)
    const isHigh = pinState === PinState.High
    const isOutput = pinState === PinState.High || pinState === PinState.Low
    return {
      digital: isHigh ? 1 : 0,
      analog: store.readAnalog(pin),
      pwm: 0,
      mode: isOutput ? 1 : 0,
    }
  }

  function sendSerialInput(text: string): void {
    if (!text) return
    avrRunner?.writeSerialInput(text)
  }

  function reset(): void {
    flushAvrSerial()
    stopPeripheralTick()

    peripheralBus.detachBoard()
    avrRunner?.reset()
    store.setExternalPinSink(null)
    store.reset()
  }

  function isDelaying(): boolean {
    // AVR mode handles delays internally via timer-based cycle counting.
    return false
  }

  function getMode(): RunnerKind {
    return kind
  }

  function getPinStore(): PinStateStore {
    return store
  }

  function getPeripheralBus(): PeripheralBus {
    return peripheralBus
  }

  function attachBoard(input: PeripheralBoardInput): void {
    // Inject the CURRENT TWI instance from the AVR runner. The AVR runner
    // re-creates AVRTWI on every reset(); attachBoard is called after every
    // load (post-reset), so we always grab the live one — peripherals that
    // register slave handlers (e.g. SSD1306 on 0x3C) see the right object.
    const twi = avrRunner?.getTwi()
    peripheralBus.attachBoard(twi ? { ...input, twi } : input)
  }

  return {
    kind,
    fqbn,
    loadSketchAsync,
    runSetup,
    runLoopIteration,
    sendSerialInput,
    getMillis,
    getPinState,
    reset,
    isDelaying,
    getMode,
    getPinStore,
    getPeripheralBus,
    attachBoard,
  }
}

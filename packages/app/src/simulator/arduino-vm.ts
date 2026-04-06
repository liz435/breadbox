// ── Arduino Virtual Machine ────────────────────────────────────────────────
//
// Ties the transpiler and stdlib together. Transpiles Arduino C++ to JS,
// then executes setup() once and loop() repeatedly, pausing for delay().
//
// Supports two execution modes:
//   "transpile" — instant, regex-based C++→JS (works without a server)
//   "avr"       — accurate ATmega328P emulation via avr8js (needs compiled hex)

import { transpile } from "./arduino-transpiler"
import { createStdlib, createStdlibState, type StdlibState } from "./arduino-stdlib"
import { createAVRRunner, arduinoPinToPort, portToArduinoPin, type AVRRunner } from "./avr-runner"
import { compileSketch } from "./avr-compiler"
import { PinState } from "avr8js"

export type VMMode = "transpile" | "avr"

export type ArduinoVMCallbacks = {
  onPinWrite: (pin: number, value: number, isPwm: boolean) => void
  onPinMode: (pin: number, mode: number) => void
  onSerialPrint: (text: string) => void
  onTone: (pin: number, frequency: number, duration?: number) => void
  onNoTone: (pin: number) => void
  onError: (error: string) => void
}

export type PinSnapshot = {
  digital: number
  analog: number
  pwm: number
  mode: number
}

export type ArduinoVM = {
  loadSketch: (code: string) => { success: boolean; error?: string }
  loadSketchAsync: (code: string) => Promise<{ success: boolean; error?: string }>
  runSetup: () => void
  runLoopIteration: () => boolean // returns false if delaying
  setExternalPin: (pin: number, value: number) => void
  setAnalogInput: (pin: number, value: number) => void
  getMillis: () => number
  getPinState: (pin: number) => PinSnapshot
  reset: () => void
  isDelaying: () => boolean
  getStdlibState: () => StdlibState
  getMode: () => VMMode
}

const MAX_LOOP_DURATION_MS = 100

// Number of CPU cycles to run per frame in AVR mode.
// 16 MHz / 60 fps ~ 266,667 cycles per frame for real-time execution.
const AVR_CYCLES_PER_FRAME = Math.round(16_000_000 / 60)

export function createArduinoVM(
  callbacks: ArduinoVMCallbacks,
  mode: VMMode = "transpile",
): ArduinoVM {
  // ── Shared state ────────────────────────────────────────────────
  let currentMode = mode
  let state = createStdlibState(Date.now())
  let simulationStartTime = Date.now()

  function getMillis(): number {
    if (currentMode === "avr" && avrRunner) {
      // Derive millis from CPU cycle count for accuracy
      return Math.floor((avrRunner.getCycleCount() / avrRunner.getFrequencyHz()) * 1000)
    }
    return Date.now() - simulationStartTime
  }

  // ── Transpile-mode state ────────────────────────────────────────
  let stdlib = createStdlib(state, callbacks, getMillis)
  let setupFn: (() => void) | null = null
  let loopFn: (() => void) | null = null

  // ── AVR-mode state ──────────────────────────────────────────────
  let avrRunner: AVRRunner | null = null
  // Track pin output states reported by the AVR runner
  const avrPinDigital = new Array(20).fill(0)
  const avrPinModes = new Array(20).fill(0) // 0=input, 1=output

  function createAVRRunnerInstance(): AVRRunner {
    return createAVRRunner({
      onPinChange: (port, pin, value) => {
        const arduinoPin = portToArduinoPin(port, pin)
        if (arduinoPin === null) return
        avrPinDigital[arduinoPin] = value ? 1 : 0
        avrPinModes[arduinoPin] = 1 // if it's outputting, it's an output pin
        callbacks.onPinWrite(arduinoPin, value ? 1 : 0, false)
      },
      onSerialOutput: (char) => {
        callbacks.onSerialPrint(char)
      },
    })
  }

  // ── loadSketch (synchronous — transpile mode only) ──────────────
  function loadSketch(code: string): { success: boolean; error?: string } {
    if (currentMode === "avr") {
      return {
        success: false,
        error: "AVR mode requires async compilation. Use loadSketchAsync() instead.",
      }
    }

    reset()

    const result = transpile(code)
    if (!result.success) {
      const errMsg = result.error
        ? `Line ${result.error.line}: ${result.error.message}`
        : "Unknown transpilation error"
      return { success: false, error: errMsg }
    }

    try {
      const globalNames = Object.keys(stdlib)
      const wrappedCode = `
${result.code}

return {
  setup: typeof setup === 'function' ? setup : function() {},
  loop: typeof loop === 'function' ? loop : function() {}
};
`
      const factory = new Function(...globalNames, wrappedCode)
      const sketch = factory(...globalNames.map((name) => stdlib[name])) as {
        setup: () => void
        loop: () => void
      }
      setupFn = sketch.setup
      loopFn = sketch.loop
      return { success: true }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to compile sketch"
      return { success: false, error: message }
    }
  }

  // ── loadSketchAsync (works for both modes) ──────────────────────
  async function loadSketchAsync(
    code: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (currentMode === "transpile") {
      return loadSketch(code)
    }

    // AVR mode: compile on the server, then load the hex
    reset()

    const result = await compileSketch(code)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    avrRunner = createAVRRunnerInstance()
    avrRunner.load(result.hex)
    return { success: true }
  }

  // ── runSetup ────────────────────────────────────────────────────
  function runSetup(): void {
    if (currentMode === "avr") {
      // In AVR mode, setup() is baked into the compiled program.
      // We run enough cycles to get through typical setup() code (~50ms worth).
      if (avrRunner) {
        try {
          avrRunner.execute(800_000) // ~50ms at 16 MHz
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Runtime error during AVR setup"
          callbacks.onError(message)
        }
      }
      return
    }

    if (!setupFn) return
    try {
      setupFn()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Runtime error in setup()"
      callbacks.onError(message)
    }
  }

  // ── runLoopIteration ────────────────────────────────────────────
  function runLoopIteration(): boolean {
    if (currentMode === "avr") {
      if (!avrRunner) return true
      try {
        avrRunner.execute(AVR_CYCLES_PER_FRAME)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Runtime error in AVR execution"
        callbacks.onError(message)
        return false
      }
      return true
    }

    // Transpile mode
    if (state.delayUntil > 0 && getMillis() < state.delayUntil) {
      return false
    }
    state.delayUntil = 0

    if (!loopFn) return true

    try {
      const startWall = Date.now()
      loopFn()
      const elapsed = Date.now() - startWall
      if (elapsed > MAX_LOOP_DURATION_MS) {
        callbacks.onError(
          `Possible infinite loop: loop() took ${elapsed}ms (limit: ${MAX_LOOP_DURATION_MS}ms)`,
        )
        return false
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Runtime error in loop()"
      callbacks.onError(message)
      return false
    }

    if (state.delayUntil > 0 && getMillis() < state.delayUntil) {
      return false
    }

    return true
  }

  // ── Pin access ──────────────────────────────────────────────────
  function setExternalPin(pin: number, value: number): void {
    if (pin < 0 || pin > 19) return

    if (currentMode === "avr" && avrRunner) {
      const mapped = arduinoPinToPort(pin)
      if (mapped) {
        avrRunner.setExternalPin(mapped.port, mapped.pin, value > 0)
      }
      return
    }

    state.pins[pin] = value
  }

  function setAnalogInput(pin: number, value: number): void {
    if (pin < 0 || pin > 19) return
    // Analog input is only tracked in transpile mode for now.
    // AVR mode would need ADC peripheral support.
    state.analogValues[pin] = Math.max(0, Math.min(1023, Math.round(value)))
  }

  function getPinState(pin: number): PinSnapshot {
    if (pin < 0 || pin > 19) {
      return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    }

    if (currentMode === "avr" && avrRunner) {
      const mapped = arduinoPinToPort(pin)
      if (mapped) {
        const pinState = avrRunner.getPin(mapped.port, mapped.pin)
        const isHigh = pinState === PinState.High
        const isOutput = pinState === PinState.High || pinState === PinState.Low
        return {
          digital: isHigh ? 1 : 0,
          analog: 0, // ADC not yet wired
          pwm: 0, // PWM detection would need timer analysis
          mode: isOutput ? 1 : 0,
        }
      }
      return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    }

    return {
      digital: state.pins[pin],
      analog: state.analogValues[pin],
      pwm: state.pwmValues[pin],
      mode: state.pinModes[pin],
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────
  function reset(): void {
    simulationStartTime = Date.now()
    state = createStdlibState(simulationStartTime)
    stdlib = createStdlib(state, callbacks, getMillis)
    setupFn = null
    loopFn = null

    if (avrRunner) {
      avrRunner.reset()
    }

    // Reset AVR pin tracking
    avrPinDigital.fill(0)
    avrPinModes.fill(0)
  }

  function isDelaying(): boolean {
    if (currentMode === "avr") {
      // AVR mode handles delays internally via timer-based cycle counting
      return false
    }
    return state.delayUntil > 0 && getMillis() < state.delayUntil
  }

  function getStdlibState(): StdlibState {
    return state
  }

  function getMode(): VMMode {
    return currentMode
  }

  return {
    loadSketch,
    loadSketchAsync,
    runSetup,
    runLoopIteration,
    setExternalPin,
    setAnalogInput,
    getMillis,
    getPinState,
    reset,
    isDelaying,
    getStdlibState,
    getMode,
  }
}

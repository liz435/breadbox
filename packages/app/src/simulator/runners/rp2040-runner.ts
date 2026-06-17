// ── RP2040 SketchRunner ───────────────────────────────────────────────────
//
// SketchRunner implementation backed by rp2040js (Cortex-M0+ emulation).
// Compiles via arduino-cli on the backend (fqbn "rp2040:rp2040:rpipico"),
// decodes the UF2 the backend returns, writes it into the emulator's flash,
// wires GPIO edges + UART0 TX into the shared pin store / serial pipe,
// and steps the CPU at ~125 MHz in 60 FPS chunks.
//
// **Lazy-loaded.** `rp2040js` is fetched via dynamic `import()` the first
// time `loadSketchAsync` runs — the ~150 KB emulator only reaches the
// bundle when a Pico sketch actually executes.
//
// Boot path (two modes):
//
//   1. Real bootrom (preferred). The RP2040 bootrom is open source (Raspberry
//      Pi, BSD-3-Clause) but isn't bundled with `rp2040js`. When it's been
//      vendored (`bun run bootrom:fetch`; see rp2040-bootrom.ts) we call
//      `chip.loadBootrom(...)` and let the real boot chain run: bootrom →
//      boot2 (first 256 bytes of flash) → firmware vector table at flash+0x100.
//      This brings up XOSC/PLLs/clocks and the ROM function table the SDK
//      calls, so timing and USB-CDC Serial behave.
//
//   2. Synthesised fallback. With no bootrom vendored, `reset()` would land
//      the PC in zero-filled bootrom memory, so we skip it: after flash load
//      we pull SP + reset-vector straight from the Arduino-Pico vector table
//      at flash+0x100 and write them into `core.SP`/`core.PC`. GPIO-only
//      sketches run; anything needing real clock/PLL/XIP init (reliable
//      timing, Serial via USB CDC) misbehaves. `bun run bootrom:fetch` fixes it.
//
// ⚠️ Ordering: `loadBootrom()` internally calls `RP2040.reset()`, which both
// latches core SP/PC from the bootrom vectors AND wipes flash to 0xFF — so the
// UF2 must be written to flash *after* loadBootrom(), never before.
//
// Both serial surfaces are wired:
//
//   - `Serial` (USB CDC) — routed through rp2040js's `USBCDC` class, which
//     simulates the enumeration handshake against `mcu.usbCtrl`. Bytes
//     written by the sketch come out via `onSerialData`; bytes we want the
//     sketch to read go in via `sendSerialByte`.
//   - `Serial1` (UART0 TX on GP0, RX on GP1) — routed through `chip.uart[0]`.
//
// `sendSerialInput` pushes to both sinks — whichever the sketch is reading
// from wins. Output from either surface fans in to the same serial monitor.
// USB CDC enumeration needs the real clocks the bootrom sets up, so it only
// works reliably in mode 1 (bootrom vendored).

import { pinStateStore, type PinStateStore } from "../pin-state-store"
import { loadRp2040Bootrom } from "../rp2040-bootrom"
import { PwmTracker } from "../pwm-tracker"
import { PeripheralBus, type PeripheralBoardInput } from "../peripherals/peripheral-bus"
import {
  breakpointAddressForLine,
  lineForAddress,
  type BoardTargetInfo,
  type LineTableEntry,
} from "@dreamer/schemas"
import { compileSketch } from "../avr-compiler"
import { sketchSizeRef } from "../sketch-size-ref"
import type {
  CustomLibraryMap,
  DebugController,
  DebugSnapshot,
  PinSnapshot,
  RunnerKind,
  SketchRunner,
  SketchRunnerCallbacks,
  SketchRunnerLoadOptions,
} from "./sketch-runner"

// RP2040 runs at 125 MHz; step count per frame for 60 FPS real-time target.
const RP2040_CYCLES_PER_FRAME = Math.round(125_000_000 / 60)
// Setup budget — longer than AVR's 50ms because a Pico sketch typically
// spends more cycles in clock/GPIO init before the first loop().
const RP2040_SETUP_CYCLES = 125_000_000 / 10 // ~100ms simulated
// Keep execution chunked so stepping stays responsive on the browser thread.
const RP2040_STEP_CHUNK_CYCLES = 4_096
const RP2040_SETUP_BUDGET_MS = 8
const RP2040_FRAME_BUDGET_MS = 6
const RP2040_MAX_LOOP_BACKLOG_CYCLES = RP2040_CYCLES_PER_FRAME * 120 // ~2s backlog cap

const FLASH_ORIGIN = 0x10000000
const ARDUINO_PICO_VECTOR_TABLE_OFFSET = 0x100

// RP2040 ADC is 12-bit (0..4095); the pin store uses the Arduino 10-bit
// convention (0..1023). rp2040js writes channelValues straight into the ADC
// RESULT register, and Arduino-Pico's analogRead() reads that 12-bit result
// and scales to the configured resolution (10-bit by default) — so we map the
// store's 0..1023 up to raw 12-bit counts here.
const RP2040_ADC_CHANNELS = 3 // ADC0..2 on GP26..28 (ch3=GP29/VSYS, ch4=temp)
const RP2040_ADC_BASE_PIN = 26 // ADC channel 0 ⇒ GP26
const RP2040_ADC_MAX_RAW = 4095
const ARDUINO_ADC_MAX = 1023

// Lazy cache of the rp2040js module so the dynamic import only happens once
// per session (subsequent `loadSketchAsync` calls reuse it).
let rp2040jsModule: typeof import("rp2040js") | null = null
async function loadRp2040js(): Promise<typeof import("rp2040js")> {
  if (!rp2040jsModule) {
    rp2040jsModule = await import("rp2040js")
  }
  return rp2040jsModule
}

type Rp2040Module = typeof import("rp2040js")
type Rp2040Instance = InstanceType<Rp2040Module["RP2040"]>
type UsbCdcInstance = InstanceType<Rp2040Module["USBCDC"]>

type GpioPinLike = {
  setInputValue?: (value: boolean) => void
}

/**
 * Bridge UI-driven input writes (PinStateStore.writeExternal) into rp2040js
 * GPIO input state so sketch digitalRead() sees the same value.
 */
export function bindRp2040ExternalPinSink(
  store: PinStateStore,
  chip: { gpio: GpioPinLike[] },
): void {
  store.setExternalPinSink((pin, digitalValue) => {
    if (pin < 0 || pin >= chip.gpio.length) return
    const gpioPin = chip.gpio[pin]
    gpioPin?.setInputValue?.(digitalValue === 1)
  })
}

export function createRp2040SketchRunner(
  target: BoardTargetInfo,
  callbacks: SketchRunnerCallbacks,
  store: PinStateStore = pinStateStore,
): SketchRunner {
  const kind: RunnerKind = "rp2040"
  const fqbn = target.fqbn

  const peripheralBus = new PeripheralBus()

  // PWM duty reconstruction — see pwm-tracker.ts. rp2040js drives analogWrite()
  // pins by toggling the GPIO at the PWM frequency, so onListener only sees the
  // instantaneous bit; the tracker averages the edge stream into a duty cycle.
  const pwmTracker = new PwmTracker()

  // Peripherals run their own housekeeping (servo silence timeout, sensor
  // frames); tick them at 20 Hz like the AVR runner so state surfaces in ~real
  // time. Started on load, cleared on reset.
  let peripheralTickHandle: ReturnType<typeof setInterval> | null = null

  // Chip + reference to the loaded rp2040js module (needed for the
  // GPIOPinState enum inside listener callbacks). `cdc` is held separately
  // so `sendSerialInput` can feed bytes to the CDC RX path without having
  // to thread the instance through every call.
  let mcu: Rp2040Instance | null = null
  let mod: Rp2040Module | null = null
  let cdc: UsbCdcInstance | null = null
  // Whether the last load booted via the real bootrom (mode 1) vs the
  // synthesised handoff (mode 2). Surfaced through getExecutionBacklog for
  // diagnostics; also gates the "Serial may be unreliable" expectations.
  let usedBootrom = false
  let pendingSetupCycles = 0
  let pendingLoopCycles = 0
  let droppedLoopCycles = 0
  let maxObservedBacklogCycles = 0

  // ── Debug state ────────────────────────────────────────────────────
  // Source-line table from the last compile (byte addresses; empty ⇒ no
  // source-level debug). Breakpoints are armed as a set of byte addresses we
  // poll core.PC against during execution. `halted` mirrors the AVR runner:
  // set when free-run stops on a breakpoint, read by the sim loop.
  let lineTable: LineTableEntry[] = []
  let breakpointAddrs = new Set<number>()
  let halted = false
  // Upper bound on instructions a single "step line" advances, so a line with
  // delay()/a busy loop can't hang the UI (the user just steps again).
  const STEP_LINE_MAX_INSTRUCTIONS = 200_000
  // Decoder reused so multi-byte UTF-8 sequences flowing across callbacks
  // don't fragment mid-codepoint on the serial monitor.
  const cdcTextDecoder = new TextDecoder("utf-8", { fatal: false })

  // ── Serial line buffering ───────────────────────────────────────────
  //
  // Both serial surfaces deliver tiny fragments (UART0 one byte at a time, CDC
  // a few bytes per packet). Forwarding each fragment straight to onSerialPrint
  // makes the Serial Monitor spawn an entry per character. Buffer instead and
  // flush whole lines on newline (or a short idle for print() with no newline),
  // mirroring the AVR runner.
  const SERIAL_IDLE_FLUSH_MS = 200
  let serialBuffer = ""
  let serialIdleTimer: ReturnType<typeof setTimeout> | null = null

  function getMillis(): number {
    if (!mcu) return 0
    // rp2040js's IClock exposes elapsed simulated time as `nanos` (there is no
    // `micros` field — reading it returned undefined and pinned millis at 0).
    const nanos = (mcu.clock as unknown as { nanos?: number }).nanos
    return typeof nanos === "number" ? Math.floor(nanos / 1_000_000) : 0
  }

  function nowMs(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now()
    }
    return Date.now()
  }

  function flushSerial(): void {
    if (serialIdleTimer) {
      clearTimeout(serialIdleTimer)
      serialIdleTimer = null
    }
    if (serialBuffer.length === 0) return
    const out = serialBuffer
    serialBuffer = ""
    callbacks.onSerialPrint(out)
  }

  // Accumulate serial output and emit complete lines at once; a trailing
  // partial line flushes after SERIAL_IDLE_FLUSH_MS so unterminated print()s
  // still surface.
  function handleSerialChunk(text: string): void {
    if (!text) return
    serialBuffer += text
    const lastNewline = serialBuffer.lastIndexOf("\n")
    if (lastNewline >= 0) {
      const complete = serialBuffer.slice(0, lastNewline + 1)
      serialBuffer = serialBuffer.slice(lastNewline + 1)
      callbacks.onSerialPrint(complete)
    }
    if (serialBuffer.length > 0) {
      if (serialIdleTimer) clearTimeout(serialIdleTimer)
      serialIdleTimer = setTimeout(flushSerial, SERIAL_IDLE_FLUSH_MS)
    }
  }

  /** Cortex-M0 PC as a byte address (Thumb bit cleared) — matches the line
   *  table's address space. */
  function pcAddr(chip: Rp2040Instance): number {
    return chip.core.PC & ~1
  }

  // Step up to `cycles` instructions. When breakpoints are armed, step one at a
  // time and stop (setting `halted`) the moment core.PC lands on a breakpoint
  // address — i.e. just before that instruction executes. Returns how many
  // instructions actually ran so the caller can decrement its budget exactly.
  function stepCycles(chip: Rp2040Instance, cycles: number): number {
    if (breakpointAddrs.size === 0) {
      for (let i = 0; i < cycles; i++) chip.step()
      return cycles
    }
    for (let i = 0; i < cycles; i++) {
      chip.step()
      if (breakpointAddrs.has(pcAddr(chip))) {
        halted = true
        return i + 1
      }
    }
    return cycles
  }

  // PwmTracker's TAU/STEADY constants are tuned in 16 MHz-equivalent "cycles"
  // (really a time base). Express rp2040 simulated time (clock.nanos) in those
  // same units (0.016 cycles/ns = 16e6/1e9) so PWM-vs-steady classification
  // keeps the AVR tuning regardless of the 125 MHz core clock.
  function pwmClock(): number {
    if (!mcu) return 0
    const nanos = (mcu.clock as unknown as { nanos?: number }).nanos
    return typeof nanos === "number" ? Math.floor(nanos * 0.016) : 0
  }

  // Mirror UI / circuit-solver analog inputs (pin store, 0..1023) into the
  // chip's ADC channelValues (raw 12-bit) so analogRead() returns them.
  function syncAdcChannels(chip: Rp2040Instance): void {
    for (let ch = 0; ch < RP2040_ADC_CHANNELS; ch++) {
      const reading = store.readAnalog(RP2040_ADC_BASE_PIN + ch) // 0..1023
      const clamped =
        reading < 0 ? 0 : reading > ARDUINO_ADC_MAX ? ARDUINO_ADC_MAX : reading
      chip.adc.channelValues[ch] = Math.round(
        (clamped / ARDUINO_ADC_MAX) * RP2040_ADC_MAX_RAW,
      )
    }
  }

  // Publish reconstructed PWM duty cycles to the store once per frame, so the
  // renderer reads a smooth isPwm/pwmValue instead of the last raw edge bit.
  // writeFromSketch no-ops when unchanged, so steady pins don't churn.
  function flushPwm(): void {
    const clk = pwmClock()
    for (const pin of pwmTracker.trackedPins()) {
      const sample = pwmTracker.sample(pin, clk)
      if (!sample) continue
      store.writeFromSketch(pin, { isPwm: sample.isPwm, pwmValue: sample.pwmValue })
    }
  }

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

  function updateBacklogMetrics(): void {
    const backlog = pendingSetupCycles + pendingLoopCycles
    if (backlog > maxObservedBacklogCycles) {
      maxObservedBacklogCycles = backlog
    }
  }

  function drainPendingCycles(chip: Rp2040Instance, budgetMs: number): void {
    const deadline = nowMs() + budgetMs
    while (!halted && (pendingSetupCycles > 0 || pendingLoopCycles > 0) && nowMs() < deadline) {
      if (pendingSetupCycles > 0) {
        const step = Math.min(RP2040_STEP_CHUNK_CYCLES, pendingSetupCycles)
        pendingSetupCycles -= stepCycles(chip, step)
      } else {
        const step = Math.min(RP2040_STEP_CHUNK_CYCLES, pendingLoopCycles)
        pendingLoopCycles -= stepCycles(chip, step)
      }
      // Flush peripheral edges scheduled during this chunk (ultrasonic echo,
      // DHT frame, IR NEC envelope) at sub-frame granularity, mirroring the
      // AVR runner's per-chunk flush.
      peripheralBus.flushScheduledEdges(getMillis())
    }
    updateBacklogMetrics()
  }

  function wireGpioListeners(chip: Rp2040Instance, Enum: Rp2040Module["GPIOPinState"]): void {
    const count = Math.min(chip.gpio.length, 30)
    for (let i = 0; i < count; i++) {
      const pin = chip.gpio[i]
      pin.addListener((state) => {
        if (state === Enum.High || state === Enum.Low) {
          const digital = state === Enum.High ? 1 : 0
          store.writeFromSketch(i, { digitalValue: digital, mode: "OUTPUT" })
          // Feed the edge to the PWM tracker so analogWrite() pins resolve to a
          // duty cycle rather than a flapping HIGH/LOW (flushPwm publishes it).
          pwmTracker.recordEdge(i, digital, pwmClock())
          peripheralBus.dispatchEdge({
            pin: i,
            value: digital,
            simMs: getMillis(),
            source: "rp2040",
          })
        } else if (state === Enum.InputPullUp) {
          store.writeFromSketch(i, { mode: "INPUT_PULLUP" })
        } else if (state === Enum.Input) {
          store.writeFromSketch(i, { mode: "INPUT" })
        }
      })
    }
  }

  function wireUart0(chip: Rp2040Instance): void {
    const uart0 = chip.uart[0]
    if (!uart0) return
    uart0.onByte = (byte: number) => {
      handleSerialChunk(String.fromCharCode(byte))
    }
  }

  function wireUsbCdc(chip: Rp2040Instance, Mod: Rp2040Module): UsbCdcInstance {
    const instance = new Mod.USBCDC(chip.usbCtrl)
    instance.onSerialData = (buf: Uint8Array) => {
      if (buf.byteLength === 0) return
      handleSerialChunk(cdcTextDecoder.decode(buf, { stream: true }))
    }
    return instance
  }

  function wireExternalPinSink(chip: Rp2040Instance): void {
    bindRp2040ExternalPinSink(store, chip as unknown as { gpio: GpioPinLike[] })
  }

  function bootArduinoPicoFirmware(chip: Rp2040Instance, flashOffset: number): void {
    // Skip the missing bootrom: read SP + reset vector from the vector
    // table that Arduino-Pico lays down 0x100 bytes into flash (boot2
    // occupies the first 256 bytes).
    const view = new DataView(chip.flash.buffer, chip.flash.byteOffset, chip.flash.byteLength)
    const vtBase = flashOffset + ARDUINO_PICO_VECTOR_TABLE_OFFSET
    if (vtBase + 8 > chip.flash.byteLength) return
    const sp = view.getUint32(vtBase, true)
    const resetVector = view.getUint32(vtBase + 4, true)
    chip.core.SP = sp
    // Thumb mode: clear the low bit of the branch target before loading PC.
    chip.core.PC = resetVector & ~1
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
    if (result.format !== "uf2") {
      return {
        success: false,
        error: `RP2040 runner received firmware in "${result.format}" format; expected "uf2". Check the fqbn (${options?.fqbn ?? fqbn}).`,
      }
    }

    if (result.sizeInfo) {
      sketchSizeRef.current = { ...result.sizeInfo, source: "actual", ts: Date.now() }
    }

    // Capture the debugger's source-line map (absent ⇒ address-only debug).
    lineTable = result.lineTable ?? []
    breakpointAddrs = new Set()
    halted = false

    // Lazy-load rp2040js, construct the chip.
    mod = await loadRp2040js()
    const chip = new mod.RP2040()
    mcu = chip
    pendingSetupCycles = 0
    pendingLoopCycles = 0
    droppedLoopCycles = 0
    maxObservedBacklogCycles = 0

    // Load the real bootrom *before* writing flash. `loadBootrom()` internally
    // calls RP2040.reset(), which latches core SP/PC from the bootrom's vector
    // table AND wipes flash to 0xFF — so the UF2 has to be written afterwards
    // or it would be erased the instant the bootrom loads.
    const bootrom = await loadRp2040Bootrom()
    usedBootrom = bootrom !== null
    if (bootrom) {
      chip.loadBootrom(bootrom)
    }

    wireGpioListeners(chip, mod.GPIOPinState)
    wireUart0(chip)
    cdc = wireUsbCdc(chip, mod)
    wireExternalPinSink(chip)

    // Write the UF2 image into flash (after any reset()/loadBootrom above).
    if (result.flashOffset + result.flash.byteLength > chip.flash.byteLength) {
      return {
        success: false,
        error: `UF2 image overflows RP2040 flash (offset 0x${result.flashOffset.toString(16)}, size ${result.flash.byteLength}).`,
      }
    }
    chip.flash.set(result.flash, result.flashOffset)

    if (!bootrom) {
      // Mode 2: no bootrom vendored — synthesise the handoff from the
      // Arduino-Pico vector table at flash+0x100. GPIO-only sketches run;
      // clock/PLL/USB-CDC-dependent code won't. `bun run bootrom:fetch` fixes
      // this properly (see rp2040-bootrom.ts).
      bootArduinoPicoFirmware(chip, result.flashOffset)
      // Surface the limitation where the user is already looking (build log),
      // so a flaky Serial/timing run has an obvious explanation + fix.
      options?.onLog?.(
        "compiler",
        "Note: no RP2040 bootrom vendored — running a synthesised GPIO-only boot. " +
          "Serial/USB-CDC, clocks and timing will be unreliable. " +
          "Run `bun run bootrom:fetch` to enable full Pico simulation.",
        Date.now(),
      )
    }

    startPeripheralTick()
    return { success: true }
  }

  function runSetup(): void {
    if (!mcu) return
    try {
      syncAdcChannels(mcu)
      pendingSetupCycles += RP2040_SETUP_CYCLES
      drainPendingCycles(mcu, RP2040_SETUP_BUDGET_MS)
      flushPwm()
    } catch (err) {
      callbacks.onError(
        err instanceof Error ? err.message : "Runtime error during RP2040 setup",
      )
    }
  }

  function runLoopIteration(): boolean {
    if (!mcu) return true
    try {
      syncAdcChannels(mcu)
      // Preserve setup-first semantics: until setup backlog is drained, don't
      // enqueue loop cycles yet.
      if (pendingSetupCycles === 0) {
        pendingLoopCycles += RP2040_CYCLES_PER_FRAME
        if (pendingLoopCycles > RP2040_MAX_LOOP_BACKLOG_CYCLES) {
          droppedLoopCycles += pendingLoopCycles - RP2040_MAX_LOOP_BACKLOG_CYCLES
          pendingLoopCycles = RP2040_MAX_LOOP_BACKLOG_CYCLES
        }
      }
      drainPendingCycles(mcu, RP2040_FRAME_BUDGET_MS)
      flushPwm()
    } catch (err) {
      callbacks.onError(
        err instanceof Error ? err.message : "Runtime error in RP2040 execution",
      )
      return false
    }
    return true
  }

  function getPinState(pin: number): PinSnapshot {
    if (!mcu || pin < 0 || pin >= mcu.gpio.length) {
      return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    }
    if (!mod) return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    const gp = mcu.gpio[pin]
    const isHigh = gp.value === mod.GPIOPinState.High
    const isOutput =
      gp.value === mod.GPIOPinState.High || gp.value === mod.GPIOPinState.Low
    // Reconstructed PWM duty (0..255) for analogWrite() pins; 0 when the pin
    // has never toggled (the tracker returns null → plain digital level).
    const pwmSample = pwmTracker.sample(pin, pwmClock())
    return {
      digital: isHigh ? 1 : 0,
      analog: store.readAnalog(pin),
      pwm: pwmSample?.isPwm ? pwmSample.pwmValue : 0,
      mode: isOutput ? 1 : 0,
    }
  }

  function sendSerialInput(text: string): void {
    if (!mcu || !text) return
    const uart0 = mcu.uart[0]
    for (let i = 0; i < text.length; i++) {
      const byte = text.charCodeAt(i) & 0xff
      uart0?.feedByte(byte)
      cdc?.sendSerialByte(byte)
    }
  }

  function reset(): void {
    flushSerial()
    stopPeripheralTick()
    if (mcu) {
      try {
        mcu.reset()
      } catch {
        // reset() on a chip with no bootrom can throw if internal state is
        // partially initialised — safe to swallow, the chip is about to be
        // dropped on the next load anyway.
      }
    }
    mcu = null
    cdc = null
    usedBootrom = false
    pendingSetupCycles = 0
    pendingLoopCycles = 0
    droppedLoopCycles = 0
    maxObservedBacklogCycles = 0
    halted = false
    breakpointAddrs = new Set()
    pwmTracker.reset()
    store.setExternalPinSink(null)
    store.reset()
    peripheralBus.detachBoard()
  }

  function isDelaying(): boolean {
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
    peripheralBus.attachBoard(input)
  }

  function getExecutionBacklog() {
    return {
      pendingSetupCycles,
      pendingLoopCycles,
      droppedLoopCycles,
      maxObservedBacklogCycles,
      usedBootrom,
    }
  }

  // ── Debug controller ────────────────────────────────────────────────────
  //
  // Source-level debugging for the Pico: arm breakpoints by source line (mapped
  // to byte addresses via the compile line table), poll core.PC during free-run
  // to halt, and single-step instruction/line. rp2040js has no native
  // breakpoint primitive, so the polling lives in stepCycles above.
  //
  // The register/SRAM inspector is AVR-only (the Cortex-M0 register file and
  // 264 KB SRAM don't fit the AVR-shaped DebugSnapshot), so snapshot() leaves
  // those empty and the panel hides them — Line/PC/SP/Cycles + breakpoints +
  // stepping all work.

  function flushAfterStep(): void {
    if (!mcu) return
    peripheralBus.flushScheduledEdges(getMillis())
    flushPwm()
    flushSerial()
  }

  function takeSnapshot(): DebugSnapshot {
    if (!mcu) {
      return { pc: 0, line: null, registers: new Uint8Array(0), sram: new Uint8Array(0), sp: 0, cycles: 0 }
    }
    const pc = pcAddr(mcu)
    return {
      pc,
      line: lineTable.length > 0 ? lineForAddress(lineTable, pc) : null,
      // Cortex-M0 state doesn't map onto the AVR-shaped inspector; expose only
      // the chip-agnostic fields and leave registers/SRAM empty (panel hides).
      registers: new Uint8Array(0),
      sram: new Uint8Array(0),
      sp: mcu.core.SP,
      cycles: mcu.core.cycles,
    }
  }

  const debug: DebugController = {
    get hasLineTable() {
      return lineTable.length > 0
    },
    setBreakpointLines(lines) {
      const armed: number[] = []
      const addrs = new Set<number>()
      for (const line of lines) {
        const address = breakpointAddressForLine(lineTable, line)
        if (address !== null) {
          addrs.add(address)
          armed.push(line)
        }
      }
      breakpointAddrs = addrs
      return armed
    },
    continue() {
      // Natural step-then-check ordering in stepCycles means resuming won't
      // immediately re-trigger the breakpoint we're parked on.
      halted = false
    },
    stepInstruction() {
      halted = false
      if (!mcu) return
      mcu.step()
      flushAfterStep()
    },
    stepLine() {
      halted = false
      if (!mcu) return
      if (lineTable.length === 0) {
        mcu.step()
        flushAfterStep()
        return
      }
      const startLine = lineForAddress(lineTable, pcAddr(mcu))
      for (let i = 0; i < STEP_LINE_MAX_INSTRUCTIONS; i++) {
        mcu.step()
        const line = lineForAddress(lineTable, pcAddr(mcu))
        if (line !== null && line !== startLine) break
      }
      flushAfterStep()
    },
    wasHalted() {
      return halted
    },
    snapshot() {
      return takeSnapshot()
    },
  }

  return {
    kind,
    fqbn,
    debug,
    loadSketchAsync,
    runSetup,
    runLoopIteration,
    sendSerialInput,
    getPinState,
    getMillis,
    reset,
    isDelaying,
    getMode,
    getPinStore,
    getPeripheralBus,
    attachBoard,
    getExecutionBacklog,
  }
}

// ── Arduino Virtual Machine ────────────────────────────────────────────────
//
// Ties the transpiler and stdlib together. Transpiles Arduino C++ to JS,
// then executes setup() once and loop() repeatedly, pausing for delay().
//
// Supports two execution modes:
//   "transpile" — instant, regex-based C++→JS (works without a server)
//   "avr"       — accurate ATmega328P emulation via avr8js (needs compiled hex)

import { transpile, type CustomLibraryMap } from "./arduino-transpiler"
import { transpileErrorRef } from "./transpile-error-ref"
import { sketchSizeRef } from "./sketch-size-ref"
import { createStdlib, createStdlibState, type StdlibState } from "./arduino-stdlib"
import { createAVRRunner, arduinoPinToPort, portToArduinoPin, type AVRRunner } from "./avr-runner"
import { compileSketch } from "./avr-compiler"
import { PinState } from "avr8js"
import { pinStateStore, type PinStateStore } from "./pin-state-store"
import { DEFAULT_BOARD_TARGET, MAX_ARDUINO_PIN, type BoardTarget } from "@dreamer/schemas"

export type VMMode = "transpile" | "avr"

export type ArduinoVMCallbacks = {
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
  loadSketch: (code: string, customLibraries?: CustomLibraryMap) => { success: boolean; error?: string }
  loadSketchAsync: (
    code: string,
    customLibraries?: CustomLibraryMap,
    options?: { fqbn?: string },
  ) => Promise<{ success: boolean; error?: string }>
  runSetup: () => void
  runLoopIteration: () => boolean // returns false if delaying
  getMillis: () => number
  getPinState: (pin: number) => PinSnapshot
  reset: () => void
  isDelaying: () => boolean
  getStdlibState: () => StdlibState
  getMode: () => VMMode
  /** Access the shared pin state store (read-only access in normal code). */
  getPinStore: () => PinStateStore
}

const MAX_LOOP_DURATION_MS = 100

// Number of CPU cycles to run per frame in AVR mode.
// 16 MHz / 60 fps ~ 266,667 cycles per frame for real-time execution.
const AVR_CYCLES_PER_FRAME = Math.round(16_000_000 / 60)

export function createArduinoVM(
  callbacks: ArduinoVMCallbacks,
  mode: VMMode = "transpile",
  store: PinStateStore = pinStateStore,
  boardTarget: BoardTarget = DEFAULT_BOARD_TARGET,
): ArduinoVM {
  // ── Shared state ────────────────────────────────────────────────
  const currentBoardTarget = boardTarget
  let currentMode = mode
  let state = createStdlibState(Date.now())
  let simulationStartTime = Date.now()
  // Virtual clock: advances by a fixed dt each loop iteration for deterministic timing.
  // In transpile mode this avoids wall-clock jitter from browser scheduling.
  let virtualMs = 0
  const VIRTUAL_DT_MS = 16 // ~60 fps worth of simulated time per tick

  function getMillis(): number {
    if (currentMode === "avr" && avrRunner) {
      return Math.floor((avrRunner.getCycleCount() / avrRunner.getFrequencyHz()) * 1000)
    }
    return virtualMs
  }

  // ── Transpile-mode state ────────────────────────────────────────
  let stdlib = createStdlib(state, callbacks, getMillis, store, currentBoardTarget)
  let setupFn: (() => void) | null = null
  let loopFn: (() => void) | null = null
  // Generator-based loop: when loop() calls delay(), it yields control
  // back to the VM. The VM resumes the generator on the next iteration
  // after the delay expires. This makes delay() actually pause execution
  // mid-function, like real Arduino delay().
  let loopGenerator: Generator | null = null
  let loopGeneratorFn: (() => Generator) | null = null

  // ── AVR-mode state ──────────────────────────────────────────────
  let avrRunner: AVRRunner | null = null
  // Track pin output states reported by the AVR runner
  const avrPinDigital = new Array(20).fill(0)
  const avrPinModes = new Array(20).fill(0) // 0=input, 1=output

  // Serial output from avr8js arrives one byte at a time (`onSerialOutput`
  // fires per char). If we forwarded each byte straight to
  // `callbacks.onSerialPrint`, the Serial Monitor would create one
  // timestamped entry per character — timestamps then appear to "roll"
  // across every character of a line. Buffer bytes into lines and flush
  // on newline (or after a short idle window for `Serial.print` without
  // a trailing newline). This matches transpile mode's per-call semantics.
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
    // A newline completes a line; emit immediately so each `Serial.println`
    // gets one Serial Monitor entry with one stable timestamp.
    if (char === "\n") {
      flushAvrSerial()
      return
    }
    // For `Serial.print` (no newline), flush after a short idle so partial
    // output still shows up, but only as a single entry per "burst".
    if (avrSerialIdleTimer) clearTimeout(avrSerialIdleTimer)
    avrSerialIdleTimer = setTimeout(flushAvrSerial, SERIAL_IDLE_FLUSH_MS)
  }

  // ── AVR pin-tone detection ────────────────────────────────────────
  //
  // In transpile mode, `tone(pin, freq)` is a JS shim that calls
  // `callbacks.onTone(pin, freq)` directly and the UI's Web Audio layer
  // plays the tone. In AVR mode, `tone()` runs real compiled AVR code
  // that toggles the pin via Timer2 — `onPinChange` fires per-edge but
  // `onTone` is never called, so the Web Audio layer stays silent and
  // buzzers on the breadboard produce no sound.
  //
  // Fix: watch pin-edge rate in the AVR callback. If a pin is toggling
  // at an audible frequency (20–20000 Hz), synthesize `onTone(pin, freq)`.
  // When the pin goes quiet, synthesize `onNoTone(pin)`. Also catches
  // `analogWrite(piezoPin, ...)` — PWM at 490/980 Hz is physically a tone
  // when played through a piezo, and users expect that to make noise.
  const AUDIBLE_MIN_HZ = 20
  const AUDIBLE_MAX_HZ = 20_000
  const TONE_SILENCE_TIMEOUT_MS = 150
  const TONE_FREQ_CHANGE_THRESHOLD = 0.1 // 10%
  const TONE_HISTORY_SIZE = 8 // edges to keep per pin for frequency estimation

  type PinToneState = {
    timestamps: number[] // ring of recent transition times (ms)
    writeIdx: number
    count: number // number of valid entries (<= HISTORY_SIZE)
    currentFreq: number | null // last frequency reported via onTone
    lastEdgeAt: number
  }
  const toneStates = new Map<number, PinToneState>()

  function getOrCreateToneState(pin: number): PinToneState {
    let s = toneStates.get(pin)
    if (!s) {
      s = {
        timestamps: new Array<number>(TONE_HISTORY_SIZE).fill(0),
        writeIdx: 0,
        count: 0,
        currentFreq: null,
        lastEdgeAt: 0,
      }
      toneStates.set(pin, s)
    }
    return s
  }

  function estimateFrequency(s: PinToneState, now: number): number | null {
    // Need at least 3 edges (1.5 cycles) for a stable reading.
    if (s.count < 3) return null
    // Oldest entry in the ring is at writeIdx (wraps around if count equals size).
    const oldestIdx = s.count < TONE_HISTORY_SIZE
      ? (s.writeIdx - s.count + TONE_HISTORY_SIZE) % TONE_HISTORY_SIZE
      : s.writeIdx
    const oldest = s.timestamps[oldestIdx]
    const elapsed = now - oldest
    if (elapsed <= 0) return null
    // One period = two edges. (count - 1) edges span (count - 1) / 2 periods.
    const periods = (s.count - 1) / 2
    const freq = (periods * 1000) / elapsed
    return freq
  }

  function notePinEdge(arduinoPin: number): void {
    const now = performance.now()
    const s = getOrCreateToneState(arduinoPin)
    s.timestamps[s.writeIdx] = now
    s.writeIdx = (s.writeIdx + 1) % TONE_HISTORY_SIZE
    if (s.count < TONE_HISTORY_SIZE) s.count++
    s.lastEdgeAt = now

    const freq = estimateFrequency(s, now)
    if (freq === null) return
    if (freq < AUDIBLE_MIN_HZ || freq > AUDIBLE_MAX_HZ) return

    // Emit onTone only on first detection or meaningful frequency change,
    // not on every edge (would spam Web Audio with thousands of calls/sec).
    const prev = s.currentFreq
    const changed = prev === null || Math.abs(freq - prev) / prev > TONE_FREQ_CHANGE_THRESHOLD
    if (changed) {
      s.currentFreq = freq
      callbacks.onTone(arduinoPin, freq)
    }
  }

  // Periodic check: pins that have stopped toggling emit onNoTone so the
  // oscillator stops. Runs at 20Hz which is fast enough for "instant" feel
  // without burning the main thread.
  let toneWatchdog: ReturnType<typeof setInterval> | null = null

  function startToneWatchdog(): void {
    if (toneWatchdog) return
    toneWatchdog = setInterval(() => {
      const now = performance.now()
      for (const [pin, s] of toneStates) {
        if (s.currentFreq === null) continue
        if (now - s.lastEdgeAt > TONE_SILENCE_TIMEOUT_MS) {
          s.currentFreq = null
          s.count = 0 // reset history so next burst starts cleanly
          callbacks.onNoTone(pin)
        }
      }
    }, 50)
  }

  function stopToneWatchdog(): void {
    if (toneWatchdog) {
      clearInterval(toneWatchdog)
      toneWatchdog = null
    }
    // Fire onNoTone for any pin still believed to be tonin', so Web Audio
    // doesn't hang an oscillator across reset.
    for (const [pin, s] of toneStates) {
      if (s.currentFreq !== null) {
        s.currentFreq = null
        callbacks.onNoTone(pin)
      }
    }
    toneStates.clear()
  }

  function createAVRRunnerInstance(): AVRRunner {
    startToneWatchdog()
    return createAVRRunner({
      onPinChange: (port, pin, value) => {
        const arduinoPin = portToArduinoPin(port, pin)
        if (arduinoPin === null) return
        avrPinDigital[arduinoPin] = value ? 1 : 0
        avrPinModes[arduinoPin] = 1 // if it's outputting, it's an output pin
        // Mirror AVR runner pin state into the shared store so React UI and
        // external writes see the same values as in transpile mode.
        store.writeFromSketch(arduinoPin, {
          digitalValue: value ? 1 : 0,
          mode: "OUTPUT",
        })
        notePinEdge(arduinoPin)
      },
      onSerialOutput: (char) => {
        handleAvrSerialByte(char)
      },
    })
  }

  // ── loadSketch (synchronous — transpile mode only) ──────────────
  function loadSketch(code: string, customLibraries?: CustomLibraryMap): { success: boolean; error?: string } {
    if (currentMode === "avr") {
      return {
        success: false,
        error: "AVR mode requires async compilation. Use loadSketchAsync() instead.",
      }
    }

    reset()

    const result = transpile(code, customLibraries)
    if (!result.success) {
      // Store structured error for CodeMirror linter to display inline
      transpileErrorRef.current = result.error ? { error: result.error, ts: Date.now() } : null
      const errMsg = result.error
        ? `Line ${result.error.line}: ${result.error.message}`
        : "Unknown transpilation error"
      return { success: false, error: errMsg }
    }
    // Clear any previous error on success
    transpileErrorRef.current = null

    // Store size estimate — stamp once so the output panel shows a stable time.
    if (result.sizeEstimate) {
      sketchSizeRef.current = { ...result.sizeEstimate, source: "estimate", ts: Date.now() }
    }

    try {
      const globalNames = Object.keys(stdlib)

      // Shadow dangerous browser globals to prevent sandbox escape.
      // The transpiled code runs in strict mode inside a function scope
      // where window, document, fetch, etc. are undefined.
      // Shadow dangerous browser globals to prevent sandbox escape.
      // Pass them as function parameters set to undefined.
      // Note: "eval", "arguments" cannot be parameter names, so we skip them.
      const blockedGlobals = [
        "window", "self", "globalThis", "document",
        "fetch", "XMLHttpRequest", "WebSocket", "EventSource",
        "localStorage", "sessionStorage", "indexedDB",
        "importScripts",
      ]
      const shadowParams = blockedGlobals.filter(g => !globalNames.includes(g))

      // Transform delay() calls into yield points for the generator-based loop.
      // Replace `delay(expr)` with `yield delay(expr)` so the VM can pause mid-function.
      const hasDelay = /\bdelay\s*\(/.test(result.code)

      // Extract ONLY the loop function body and create a generator version of it.
      // This avoids redeclaring top-level variables (let myServo, etc.).
      let genLoopDef = ""
      if (hasDelay) {
        const loopMatch = result.code.match(/function\s+loop\s*\(\s*\)\s*\{/)
        if (loopMatch && loopMatch.index != null) {
          // Find the matching closing brace for the loop function
          let braceCount = 0
          let loopEnd = loopMatch.index + loopMatch[0].length
          for (let i = loopEnd - 1; i < result.code.length; i++) {
            if (result.code[i] === "{") braceCount++
            else if (result.code[i] === "}") {
              braceCount--
              if (braceCount === 0) { loopEnd = i + 1; break }
            }
          }
          const loopBody = result.code.slice(loopMatch.index, loopEnd)
          // Transform delay → yield delay, and function loop → function* _genLoop
          genLoopDef = loopBody
            .replace(/\bdelay\s*\(([^)]*)\)\s*;/g, "yield delay($1);")
            .replace(/function\s+loop\s*\(\s*\)/, "function* _genLoop()")
        }
      }

      const wrappedCode = `
${result.code}

${genLoopDef}

var _setup = typeof setup === 'function' ? setup : function() {};
var _loop = typeof loop === 'function' ? loop : function() {};
var _gen = typeof _genLoop === 'function' ? _genLoop : null;
return { setup: _setup, loop: _loop, genLoop: _gen };
`

      const factory = new Function(...globalNames, ...shadowParams, wrappedCode)
      const args = [
        ...globalNames.map((name) => stdlib[name]),
        ...shadowParams.map(() => undefined),
      ]

      try {
        const sketch = factory(...args) as {
          setup: () => void
          loop: () => void
          genLoop: (() => Generator) | null
        }
        setupFn = sketch.setup
        loopFn = sketch.loop
        loopGeneratorFn = sketch.genLoop
        loopGenerator = null
      } catch {
        // Generator compilation failed — try without it
        const fallbackCode = `
${result.code}

var _setup = typeof setup === 'function' ? setup : function() {};
var _loop = typeof loop === 'function' ? loop : function() {};
return { setup: _setup, loop: _loop, genLoop: null };
`
        const fallbackFactory = new Function(...globalNames, ...shadowParams, fallbackCode)
        const sketch = fallbackFactory(...args) as {
          setup: () => void
          loop: () => void
          genLoop: null
        }
        setupFn = sketch.setup
        loopFn = sketch.loop
        loopGeneratorFn = null
        loopGenerator = null
      }

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
    customLibraries?: CustomLibraryMap,
    options?: { fqbn?: string },
  ): Promise<{ success: boolean; error?: string }> {
    if (currentMode === "transpile") {
      return loadSketch(code, customLibraries)
    }

    // AVR mode: compile on the server, then load the hex. Convert the
    // transpiler-shaped CustomLibraryMap (filename → code) into the
    // richer backend shape (filename → { name, code }) so arduino-cli can
    // resolve `#include "<name>"` against per-compile library files.
    reset()

    const backendLibs: Record<string, { name: string; code: string; description: string }> = {}
    if (customLibraries) {
      for (const [name, codeBody] of Object.entries(customLibraries)) {
        backendLibs[name] = { name, code: codeBody, description: "" }
      }
    }

    const result = await compileSketch(code, {
      fqbn: options?.fqbn,
      customLibraries: backendLibs,
    })
    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Store actual size info from compiler — timestamped once so the output
    // panel displays a stable stamp (not "now" on every re-render).
    if (result.sizeInfo) {
      sketchSizeRef.current = { ...result.sizeInfo, source: "actual", ts: Date.now() }
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

    // Transpile mode: advance virtual clock
    virtualMs += VIRTUAL_DT_MS

    if (state.delayUntil > 0 && getMillis() < state.delayUntil) {
      return false
    }
    state.delayUntil = 0

    // Use generator-based loop if available (supports mid-function delay)
    if (loopGeneratorFn) {
      try {
        // Start a new generator if we don't have one (first call or previous finished)
        if (!loopGenerator) {
          loopGenerator = loopGeneratorFn()
        }

        const startWall = Date.now()
        const result = loopGenerator.next()
        const elapsed = Date.now() - startWall

        if (elapsed > MAX_LOOP_DURATION_MS) {
          callbacks.onError(`Possible infinite loop: loop() took ${elapsed}ms`)
          return false
        }

        if (result.done) {
          // Generator finished — start fresh on next iteration
          loopGenerator = null
        }

        // Check if delay was set during this step
        if (state.delayUntil > 0 && getMillis() < state.delayUntil) {
          return false
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Runtime error in loop()"
        callbacks.onError(message)
        loopGenerator = null
        return false
      }
      return true
    }

    // Fallback: normal (non-generator) loop
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
  //
  // Pin reads/writes go through the shared PinStateStore. External callers
  // (UI button presses, circuit solver analog feed) should call
  // `vm.getPinStore().writeExternal(...)` directly — no VM-level wrappers.

  function getPinState(pin: number): PinSnapshot {
    if (pin < 0 || pin > MAX_ARDUINO_PIN) {
      return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    }

    // AVR mode: prefer the AVR runner's ground truth for digital/mode
    if (currentMode === "avr" && avrRunner) {
      const mapped = arduinoPinToPort(pin)
      if (mapped) {
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
      return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    }

    // Transpile mode: single source of truth is the store
    const snap = store.getPin(pin)
    if (!snap) return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    const modeNum =
      snap.mode === "OUTPUT" ? 1 :
      snap.mode === "INPUT_PULLUP" ? 2 :
      snap.mode === "INPUT" ? 0 : 0
    return {
      digital: snap.digitalValue,
      analog: snap.analogValue,
      pwm: snap.pwmValue,
      mode: modeNum,
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────
  function reset(): void {
    // Flush any buffered AVR serial bytes so partial output from the
    // previous run doesn't leak into the next, and cancel the idle timer
    // so it doesn't fire into a stale context.
    flushAvrSerial()

    // Stop any in-progress tone detection and fire final onNoTone so
    // buzzers don't keep playing across a sketch reload.
    stopToneWatchdog()

    simulationStartTime = Date.now()
    virtualMs = 0
    state = createStdlibState(simulationStartTime)
    stdlib = createStdlib(state, callbacks, getMillis, store, currentBoardTarget)
    setupFn = null
    loopFn = null
    loopGenerator = null
    loopGeneratorFn = null

    if (avrRunner) {
      avrRunner.reset()
    }

    // Reset AVR pin tracking
    avrPinDigital.fill(0)
    avrPinModes.fill(0)

    // Reset shared pin store — all pins back to defaults
    store.reset()
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

  function getPinStore(): PinStateStore {
    return store
  }

  return {
    loadSketch,
    loadSketchAsync,
    runSetup,
    runLoopIteration,
    getMillis,
    getPinState,
    reset,
    isDelaying,
    getStdlibState,
    getMode,
    getPinStore,
  }
}

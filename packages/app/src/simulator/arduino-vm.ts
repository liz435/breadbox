// ── Arduino Virtual Machine ────────────────────────────────────────────────
//
// Ties the transpiler and stdlib together. Transpiles Arduino C++ to JS,
// then executes setup() once and loop() repeatedly, pausing for delay().

import { transpile } from "./arduino-transpiler"
import { createStdlib, createStdlibState, type StdlibState } from "./arduino-stdlib"

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
  runSetup: () => void
  runLoopIteration: () => boolean // returns false if delaying
  setExternalPin: (pin: number, value: number) => void
  setAnalogInput: (pin: number, value: number) => void
  getMillis: () => number
  getPinState: (pin: number) => PinSnapshot
  reset: () => void
  isDelaying: () => boolean
  getStdlibState: () => StdlibState
}

const MAX_LOOP_DURATION_MS = 100

export function createArduinoVM(callbacks: ArduinoVMCallbacks): ArduinoVM {
  let state = createStdlibState(Date.now())
  let setupFn: (() => void) | null = null
  let loopFn: (() => void) | null = null
  let simulationStartTime = Date.now()

  function getMillis(): number {
    return Date.now() - simulationStartTime
  }

  let stdlib = createStdlib(state, callbacks, getMillis)

  function loadSketch(code: string): { success: boolean; error?: string } {
    // Reset state for new sketch
    reset()

    const result = transpile(code)
    if (!result.success) {
      const errMsg = result.error
        ? `Line ${result.error.line}: ${result.error.message}`
        : "Unknown transpilation error"
      return { success: false, error: errMsg }
    }

    try {
      // Build a function that receives all stdlib globals as parameters
      // and defines setup/loop in its scope, then returns them.
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

  function runSetup(): void {
    if (!setupFn) return
    try {
      setupFn()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Runtime error in setup()"
      callbacks.onError(message)
    }
  }

  function runLoopIteration(): boolean {
    // Check if we're still waiting on a delay
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

    // If loop() called delay(), we signal the caller to pause
    if (state.delayUntil > 0 && getMillis() < state.delayUntil) {
      return false
    }

    return true
  }

  function setExternalPin(pin: number, value: number): void {
    if (pin < 0 || pin > 19) return
    state.pins[pin] = value
  }

  function setAnalogInput(pin: number, value: number): void {
    if (pin < 0 || pin > 19) return
    state.analogValues[pin] = Math.max(0, Math.min(1023, Math.round(value)))
  }

  function getPinState(pin: number): PinSnapshot {
    if (pin < 0 || pin > 19) {
      return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    }
    return {
      digital: state.pins[pin],
      analog: state.analogValues[pin],
      pwm: state.pwmValues[pin],
      mode: state.pinModes[pin],
    }
  }

  function reset(): void {
    simulationStartTime = Date.now()
    state = createStdlibState(simulationStartTime)
    stdlib = createStdlib(state, callbacks, getMillis)
    setupFn = null
    loopFn = null
  }

  function isDelaying(): boolean {
    return state.delayUntil > 0 && getMillis() < state.delayUntil
  }

  function getStdlibState(): StdlibState {
    return state
  }

  return {
    loadSketch,
    runSetup,
    runLoopIteration,
    setExternalPin,
    setAnalogInput,
    getMillis,
    getPinState,
    reset,
    isDelaying,
    getStdlibState,
  }
}

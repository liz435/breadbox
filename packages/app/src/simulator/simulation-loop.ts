// ── Simulation Loop Hook ───────────────────────────────────────────────────
//
// Connects the Arduino VM to the simulation state machine and the board
// state machine via a React hook. Drives the rAF loop.

import { useCallback, useEffect, useRef } from "react"
import { useMachine } from "@xstate/react"
import { simulationMachine } from "./simulation-machine"
import { createArduinoVM, type ArduinoVM, type ArduinoVMCallbacks, type VMMode } from "./arduino-vm"
import type { LibraryState, ServoState } from "@dreamer/schemas"

export type SimulationStatus = "stopped" | "compiling" | "running" | "paused" | "error"

export type SimulationActions = {
  status: SimulationStatus
  error: string | null
  play: (sketchCode: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  vm: ArduinoVM | null
}

type SimulationHookOptions = {
  mode?: VMMode
  onPinWrite?: (pin: number, value: number, isPwm: boolean) => void
  onPinMode?: (pin: number, mode: number) => void
  onSerialPrint?: (text: string) => void
  onTone?: (pin: number, frequency: number, duration?: number) => void
  onNoTone?: (pin: number) => void
  onError?: (error: string) => void
  onLibraryStateChange?: (changes: Partial<LibraryState>) => void
  /** Called each tick to feed analog values from circuit solver into the VM */
  getAnalogInputs?: () => Map<number, number> | null
}

export function useSimulation(options: SimulationHookOptions = {}): SimulationActions {
  const [state, send] = useMachine(simulationMachine)
  const vmRef = useRef<ArduinoVM | null>(null)
  const rafRef = useRef<number | null>(null)
  const modeRef = useRef<VMMode>(options.mode ?? "transpile")
  modeRef.current = options.mode ?? "transpile"

  // Keep latest callbacks in a ref to avoid re-creating the VM on every render
  const callbacksRef = useRef<SimulationHookOptions>(options)
  callbacksRef.current = options

  // ── Web Audio tone generation ────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null)
  const oscillatorsRef = useRef<Map<number, { osc: OscillatorNode; gain: GainNode; timer?: ReturnType<typeof setTimeout> }>>(new Map())

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume()
    return audioCtxRef.current
  }

  function startTone(pin: number, frequency: number, duration?: number) {
    stopTone(pin)
    const ctx = getAudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "square"
    osc.frequency.value = frequency
    gain.gain.value = 0.05 // keep volume low
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    const entry: { osc: OscillatorNode; gain: GainNode; timer?: ReturnType<typeof setTimeout> } = { osc, gain }
    if (duration && duration > 0) {
      entry.timer = setTimeout(() => stopTone(pin), duration)
    }
    oscillatorsRef.current.set(pin, entry)
  }

  function stopTone(pin: number) {
    const entry = oscillatorsRef.current.get(pin)
    if (entry) {
      if (entry.timer) clearTimeout(entry.timer)
      try { entry.osc.stop() } catch { /* already stopped */ }
      oscillatorsRef.current.delete(pin)
    }
  }

  function stopAllTones() {
    for (const [pin] of oscillatorsRef.current) stopTone(pin)
  }

  // Create stable VM callbacks that delegate to the latest options
  const vmCallbacks: ArduinoVMCallbacks = {
    onPinWrite: (pin, value, isPwm) =>
      callbacksRef.current.onPinWrite?.(pin, value, isPwm),
    onPinMode: (pin, mode) => callbacksRef.current.onPinMode?.(pin, mode),
    onSerialPrint: (text) => callbacksRef.current.onSerialPrint?.(text),
    onTone: (pin, freq, dur) => {
      callbacksRef.current.onTone?.(pin, freq, dur)
      startTone(pin, freq, dur)
    },
    onNoTone: (pin) => {
      callbacksRef.current.onNoTone?.(pin)
      stopTone(pin)
    },
    onError: (error) => {
      callbacksRef.current.onError?.(error)
      send({ type: "RUNTIME_ERROR", message: error })
    },
  }

  // Lazily create the VM
  function getVM(): ArduinoVM {
    if (!vmRef.current || vmRef.current.getMode() !== modeRef.current) {
      vmRef.current = createArduinoVM(vmCallbacks, modeRef.current)
    }
    return vmRef.current
  }

  const cancelLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  // Track previous library state to avoid dispatching unchanged values
  const prevLibStateRef = useRef<string>("")

  const syncLibraryState = useCallback(() => {
    const vm = vmRef.current
    if (!vm) return
    const onLibChange = callbacksRef.current.onLibraryStateChange
    if (!onLibChange) return

    const stdlibState = vm.getStdlibState()

    // Convert stdlib servos Map to a record
    const servos: Record<string, ServoState> = {}
    for (const [id, entry] of stdlibState.servos) {
      servos[id] = { pin: entry.pin, angle: entry.angle }
    }

    // Convert stdlib lcd to schema format
    const lcd = stdlibState.lcd
      ? {
          pins: [] as number[],
          cols: stdlibState.lcd.cols,
          rows: stdlibState.lcd.rows,
          cursorCol: stdlibState.lcd.cursorCol,
          cursorRow: stdlibState.lcd.cursorRow,
          textBuffer: stdlibState.lcd.buffer,
        }
      : null

    // Simple serialization check to avoid unnecessary dispatches
    const serialized = JSON.stringify({ servos, lcd })
    if (serialized === prevLibStateRef.current) return
    prevLibStateRef.current = serialized

    onLibChange({ servos, lcd })
  }, [])

  const startLoop = useCallback(() => {
    cancelLoop()

    function tick() {
      const vm = vmRef.current
      if (!vm) return

      // Feed analog values from circuit solver into VM
      const analogInputs = callbacksRef.current.getAnalogInputs?.()
      if (analogInputs) {
        for (const [pin, voltage] of analogInputs) {
          // Convert 0-5V to 0-1023 ADC range
          const adcValue = Math.round((voltage / 5) * 1023)
          vm.setAnalogInput(pin, adcValue)
        }
      }

      // Run loop iteration — it may return false if delaying
      vm.runLoopIteration()

      // Sync library state (servos, LCD) to board machine
      syncLibraryState()

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [cancelLoop, syncLibraryState])

  const play = useCallback(
    (sketchCode: string) => {
      send({ type: "PLAY" })

      const vm = getVM()
      vm.reset()

      const currentMode = modeRef.current

      if (currentMode === "avr") {
        // AVR mode: async compile then run
        vm.loadSketchAsync(sketchCode).then((result) => {
          if (!result.success) {
            send({
              type: "COMPILE_ERROR",
              message: result.error ?? "Compilation failed",
            })
            return
          }
          send({ type: "COMPILE_SUCCESS" })
          vm.runSetup()
          startLoop()
        })
      } else {
        // Transpile mode: synchronous
        const result = vm.loadSketch(sketchCode)
        if (!result.success) {
          send({ type: "COMPILE_ERROR", message: result.error ?? "Compilation failed" })
          return
        }

        send({ type: "COMPILE_SUCCESS" })
        vm.runSetup()
        startLoop()
      }
    },
    [send, startLoop],
  )

  const pause = useCallback(() => {
    cancelLoop()
    send({ type: "PAUSE" })
  }, [send, cancelLoop])

  const resume = useCallback(() => {
    send({ type: "RESUME" })
    startLoop()
  }, [send, startLoop])

  const stop = useCallback(() => {
    cancelLoop()
    stopAllTones()
    vmRef.current?.reset()
    send({ type: "STOP" })
  }, [send, cancelLoop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelLoop()
      stopAllTones()
    }
  }, [cancelLoop])

  const status = state.value as SimulationStatus

  return {
    status,
    error: state.context.errorMessage,
    play,
    pause,
    resume,
    stop,
    vm: vmRef.current,
  }
}

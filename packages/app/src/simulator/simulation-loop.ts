// ── Simulation Loop Hook ───────────────────────────────────────────────────
//
// Connects the Arduino VM to the simulation state machine and the board
// state machine via a React hook. Drives the rAF loop.

import React, { useCallback, useEffect, useRef } from "react"
import { useMachine } from "@xstate/react"
import { simulationMachine } from "./simulation-machine"
import { createArduinoVM, type ArduinoVM, type ArduinoVMCallbacks, type VMMode } from "./arduino-vm"
import { analyzeCircuit, type CircuitAnalysis } from "./circuit-solver"
import { getComponentFootprint, areConnected } from "@/breadboard/breadboard-grid"
import { BoardContext } from "@/store/board-context"
import type { LibraryState, ServoState } from "@dreamer/schemas"

export type SimulationStatus = "stopped" | "compiling" | "running" | "paused" | "error"

/**
 * Global ref to the latest circuit analysis computed inside the simulation tick.
 * The circuit analysis React hook reads from this when the simulation is running,
 * avoiding the chicken-and-egg timing problem between React renders and the rAF loop.
 */
export const latestSimAnalysisRef: { current: React.RefObject<CircuitAnalysis | null> | null } = { current: null }

export type SimulationActions = {
  status: SimulationStatus
  error: string | null
  play: (sketchCode: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  sendSerialInput: (text: string) => void
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

  // Board actor for reading live state in the tick loop
  const boardActor = BoardContext.useActorRef()

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
      clearTimeout(rafRef.current)
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

  // Shared analysis result — updated inside the tick loop.
  // Also exposed globally so the circuit analysis hook can read it.
  const analysisResultRef = useRef<CircuitAnalysis | null>(null)
  latestSimAnalysisRef.current = analysisResultRef

  /** Run circuit analysis and feed analog values into the VM. */
  function runInlineAnalysis() {
    const ctx = boardActor.getSnapshot().context
    const hasCircuitComponents = Object.values(ctx.components).some(
      c => c.type !== "arduino_uno" && c.type !== "wire"
    )
    if (!hasCircuitComponents) {
      analysisResultRef.current = null
      return
    }

    try {
      const result = analyzeCircuit(ctx.components, ctx.wires, ctx.pinStates)
      analysisResultRef.current = result

      if (!result.isValid) return
      const vm = vmRef.current
      if (!vm) return

      // Feed component voltages to analog pins
      // 1. Explicit pin assignments
      for (const comp of Object.values(ctx.components)) {
        const compState = result.componentStates.get(comp.id)
        if (!compState) continue
        for (const [, pin] of Object.entries(comp.pins)) {
          if (pin !== null && pin >= 14 && pin <= 19) {
            vm.setAnalogInput(pin, Math.round((Math.min(5, Math.abs(compState.voltage)) / 5) * 1023))
          }
        }
      }

      // 2. Wire-based: Arduino analog pin wires landing on component footprints
      for (const wire of Object.values(ctx.wires)) {
        if (wire.fromRow !== -999) continue
        const arduinoPin = wire.fromCol
        if (arduinoPin < 14 || arduinoPin > 19) continue
        const wireTo = { row: wire.toRow, col: wire.toCol }
        for (const comp of Object.values(ctx.components)) {
          if (comp.type === "arduino_uno" || comp.type === "wire") continue
          const compState = result.componentStates.get(comp.id)
          if (!compState) continue
          const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation)
          if (footprint.points.some(pt => areConnected(wireTo, pt))) {
            vm.setAnalogInput(arduinoPin, Math.round((Math.min(5, Math.abs(compState.voltage)) / 5) * 1023))
            break
          }
        }
      }
    } catch {
      analysisResultRef.current = null
    }
  }

  const startLoop = useCallback(() => {
    cancelLoop()

    let frameCount = 0

    function tick() {
      const vm = vmRef.current
      if (!vm) return

      frameCount++

      // Run circuit analysis every 12 frames (~5 times/sec at 60fps)
      // Also run on the very first frame so analog values are seeded
      if (frameCount === 1 || frameCount % 12 === 0) {
        runInlineAnalysis()
      }

      // Run loop iteration — it may return false if delaying
      vm.runLoopIteration()

      // Sync library state (servos, LCD) to board machine
      syncLibraryState()

      // Yield to React every 4th frame
      if (frameCount % 4 === 0) {
        rafRef.current = setTimeout(() => {
          rafRef.current = requestAnimationFrame(tick)
        }, 0) as unknown as number
      } else {
        rafRef.current = requestAnimationFrame(tick)
      }
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
        runInlineAnalysis()
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
    // Reset pin states so LEDs/components go back to off
    boardActor.send({ type: "RESET_PINS" })
    // Clear the simulation analysis so visuals reflect the stopped state
    analysisResultRef.current = null
    send({ type: "STOP" })
  }, [send, cancelLoop, boardActor])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelLoop()
      stopAllTones()
    }
  }, [cancelLoop])

  /** Feed text into the VM's Serial.read() buffer. */
  const sendSerialInput = useCallback((text: string) => {
    const vm = vmRef.current
    if (!vm) return
    const stdlibState = vm.getStdlibState()
    // Push each character into the serial buffer
    for (const ch of text) {
      stdlibState.serialBuffer.push(ch)
    }
  }, [])

  const status = state.value as SimulationStatus

  return {
    status,
    error: state.context.errorMessage,
    play,
    pause,
    resume,
    stop,
    sendSerialInput,
    vm: vmRef.current,
  }
}

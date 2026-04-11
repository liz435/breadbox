// ── Simulation Loop Hook ───────────────────────────────────────────────────
//
// Connects the Arduino VM to the simulation state machine and the board
// state machine via a React hook. Drives the rAF loop.

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useMachine } from "@xstate/react"
import { simulationMachine } from "./simulation-machine"
import { createArduinoVM, type ArduinoVM, type ArduinoVMCallbacks, type VMMode } from "./arduino-vm"
import { analyzeCircuit, type CircuitAnalysis } from "./circuit-solver"
import { snapshotAsPinStates } from "./pin-state-store"
import { applySensorInputs, resetSensorBuses } from "./sensor-inputs"
import { getComponentFootprint, areConnected } from "@/breadboard/breadboard-grid"
import { BoardContext } from "@/store/board-context"
import { getGlobalSelectedPort } from "./use-board-connection"
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

  // C1: auto-switch to AVR mode when a real board is connected (cycle-accurate
  // simulation is the correct "expected" side for hardware diff). Fall back to
  // transpile when no board is plugged in.
  const [autoMode, setAutoMode] = useState<VMMode>("transpile")
  useEffect(() => {
    const check = () => {
      const connected = getGlobalSelectedPort() !== null
      setAutoMode(connected ? "avr" : "transpile")
    }
    check()
    const id = setInterval(check, 2_000)
    return () => clearInterval(id)
  }, [])

  const modeRef = useRef<VMMode>(options.mode ?? autoMode)
  modeRef.current = options.mode ?? autoMode

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

  // Create stable VM callbacks that delegate to the latest options.
  // Pin writes no longer flow through here — they go directly into the
  // shared PinStateStore (see simulator/pin-state-store.ts).
  const vmCallbacks: ArduinoVMCallbacks = {
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

  /** Run circuit analysis and feed analog voltages into the pin store. */
  function runInlineAnalysis() {
    const ctx = boardActor.getSnapshot().context
    const hasCircuitComponents = Object.values(ctx.components).some(
      c => c.type !== "arduino_uno" && c.type !== "wire"
    )
    if (!hasCircuitComponents) {
      analysisResultRef.current = null
      return
    }

    const vm = vmRef.current
    if (!vm) return
    const store = vm.getPinStore()

    try {
      const result = analyzeCircuit(ctx.components, ctx.wires, snapshotAsPinStates(store))
      analysisResultRef.current = result

      if (!result.isValid) return

      const voltsToAnalog = (v: number) =>
        Math.round((Math.min(5, Math.abs(v)) / 5) * 1023)

      // Feed component voltages to analog pins.
      // 1. Explicit pin assignments
      for (const comp of Object.values(ctx.components)) {
        const compState = result.componentStates.get(comp.id)
        if (!compState) continue
        for (const [, pin] of Object.entries(comp.pins)) {
          if (pin !== null && pin >= 14 && pin <= 19) {
            store.writeExternal(pin, { analogValue: voltsToAnalog(compState.voltage) })
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
          const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties)
          if (footprint.points.some(pt => areConnected(wireTo, pt))) {
            store.writeExternal(arduinoPin, { analogValue: voltsToAnalog(compState.voltage) })
            break
          }
        }
      }

      // 3. Apply sensor-driven inputs LAST so photoresistor/ultrasonic/PIR/etc.
      // values override any stale SPICE-computed voltage on their signal pin.
      applySensorInputs(ctx.components, ctx.wires, store)
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

      // Run loop iteration — it may return false if delaying.
      // External digital inputs (button press, etc.) go straight into the
      // PinStateStore via writeExternal() — no per-frame sync loop needed.
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

  /** Build a filename→code map from board state custom libraries */
  function getCustomLibraryMap(): Record<string, string> {
    const libs = boardActor.getSnapshot().context.customLibraries
    const map: Record<string, string> = {}
    for (const [name, lib] of Object.entries(libs)) {
      // Key is the filename the user uses in #include "name"
      map[name] = lib.code
    }
    return map
  }

  const play = useCallback(
    (sketchCode: string) => {
      send({ type: "PLAY" })

      const vm = getVM()
      vm.reset()
      resetSensorBuses()
      const customLibs = getCustomLibraryMap()

      const currentMode = modeRef.current

      if (currentMode === "avr") {
        // AVR mode: async compile then run
        vm.loadSketchAsync(sketchCode, customLibs).then((result) => {
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
        const result = vm.loadSketch(sketchCode, customLibs)
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
    // Clear sensor input busses so stale values don't leak into the next run.
    resetSensorBuses()
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

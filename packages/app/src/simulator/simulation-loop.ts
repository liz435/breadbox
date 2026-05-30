// ── Simulation Loop Hook ───────────────────────────────────────────────────
//
// Connects the Arduino VM to the simulation state machine and the board
// state machine via a React hook. Drives the rAF loop.

import React, { useCallback, useEffect, useRef } from "react"
import { useMachine } from "@xstate/react"
import { simulationMachine } from "./simulation-machine"
import { createSketchRunner, type SketchRunner, type SketchRunnerCallbacks } from "./runners"
import { analyzeCircuit, hasCapacitor, type CircuitAnalysis } from "./circuit-solver"
import { snapshotAsPinStates } from "./pin-state-store"
import { applySensorInputs, resetSensorBuses } from "./sensor-inputs"
import { RunTokenGate } from "./run-token-gate"
import { getBoardPinLayout, getComponentFootprint, areConnected } from "@/breadboard/breadboard-grid"
import { BoardContext } from "@/store/board-context"
import { BOARD_TARGETS, DEFAULT_BOARD_TARGET, isBoardComponentType, type LibraryState, type ServoState } from "@dreamer/schemas"

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
  runner: SketchRunner | null
}

type SimulationHookOptions = {
  onSerialPrint?: (text: string) => void
  onError?: (error: string) => void
  onLibraryStateChange?: (changes: Partial<LibraryState>) => void
  /**
   * Called once per line streamed from the arduino-cli compile step.
   * Mirrors the log into the Code Output panel.
   */
  onBuildLog?: (tag: "compiler" | "upload", line: string, ts: number) => void
  /** Called each tick to feed analog values from circuit solver into the runner */
  getAnalogInputs?: () => Map<number, number> | null
}

export function useSimulation(options: SimulationHookOptions = {}): SimulationActions {
  const [state, send] = useMachine(simulationMachine)
  const runnerRef = useRef<SketchRunner | null>(null)
  const runnerBoardTargetRef = useRef(DEFAULT_BOARD_TARGET)
  const rafRef = useRef<number | null>(null)
  // Board actor for reading live state in the tick loop
  const boardActor = BoardContext.useActorRef()

  // Keep latest callbacks in a ref to avoid re-creating the runner on every render
  const callbacksRef = useRef<SimulationHookOptions>(options)
  callbacksRef.current = options

  // Monotonic token guarding async compile callbacks. Any stop() or newer
  // play() invalidates older in-flight loadSketchAsync completions.
  const runTokenGateRef = useRef(new RunTokenGate())

  // ── Web Audio (bus-driven) ───────────────────────────────────────
  //
  // The peripheral bus owns audio intent: a `BuzzerPeripheral` exposes
  // `{ playing, frequencyHz }` per tick. We compare that against the set of
  // currently-ringing oscillators and reconcile. This means the audio layer
  // fires only when a buzzer is actually wired to the pin — arbitrary pin
  // toggles (shiftOut, bit-banged SPI, servo PWM) produce no sound.
  const audioCtxRef = useRef<AudioContext | null>(null)
  const oscillatorsRef = useRef<Map<string, { osc: OscillatorNode; gain: GainNode; frequency: number }>>(new Map())

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume()
    return audioCtxRef.current
  }

  function startOsc(id: string, frequency: number) {
    const ctx = getAudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "square"
    osc.frequency.value = frequency
    gain.gain.value = 0.05
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    oscillatorsRef.current.set(id, { osc, gain, frequency })
  }

  function stopOsc(id: string) {
    const entry = oscillatorsRef.current.get(id)
    if (!entry) return
    try { entry.osc.stop() } catch { /* already stopped */ }
    oscillatorsRef.current.delete(id)
  }

  function stopAllTones() {
    for (const id of Array.from(oscillatorsRef.current.keys())) stopOsc(id)
  }

  function closeAudioContext() {
    stopAllTones()
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
  }

  /** Reconcile currently-ringing oscillators with the bus's buzzer state. */
  function syncAudioFromBus() {
    const runner = runnerRef.current
    if (!runner) return
    const snapshot = runner.getPeripheralBus().snapshot()
    const alive = new Set<string>()
    for (const [id, s] of Object.entries(snapshot)) {
      if (s.kind !== "buzzer") continue
      alive.add(id)
      if (!s.playing || s.frequencyHz === null) {
        stopOsc(id)
        continue
      }
      const current = oscillatorsRef.current.get(id)
      if (!current) {
        startOsc(id, s.frequencyHz)
      } else if (Math.abs(current.frequency - s.frequencyHz) > 1) {
        current.osc.frequency.value = s.frequencyHz
        current.frequency = s.frequencyHz
      }
    }
    // Stop oscillators whose peripheral is gone (board edited, sketch reset).
    for (const id of Array.from(oscillatorsRef.current.keys())) {
      if (!alive.has(id)) stopOsc(id)
    }
  }

  // Stable runner callbacks that delegate to the latest options. Pin writes
  // no longer flow through here — they go directly into the shared
  // PinStateStore (see simulator/pin-state-store.ts). Audio is driven from
  // the peripheral bus (syncAudioFromBus), not callbacks.
  const runnerCallbacks: SketchRunnerCallbacks = {
    onSerialPrint: (text) => callbacksRef.current.onSerialPrint?.(text),
    onError: (error) => {
      callbacksRef.current.onError?.(error)
      send({ type: "RUNTIME_ERROR", message: error })
    },
  }

  // Lazily create the runner. Rebuild if the board target changed so the new
  // target's fqbn / runner kind takes effect.
  function getRunner(): SketchRunner {
    const currentBoardTarget = boardActor.getSnapshot().context.boardTarget ?? DEFAULT_BOARD_TARGET
    if (
      !runnerRef.current ||
      runnerBoardTargetRef.current !== currentBoardTarget
    ) {
      runnerRef.current = createSketchRunner(BOARD_TARGETS[currentBoardTarget], runnerCallbacks)
      runnerBoardTargetRef.current = currentBoardTarget
    }
    return runnerRef.current
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
    const runner = runnerRef.current
    if (!runner) return
    const onLibChange = callbacksRef.current.onLibraryStateChange
    if (!onLibChange) return

    // Single source of truth: the peripheral bus. Servo angles, LCD text
    // buffers, and OLED framebuffers all flow out of bus peripherals.
    const servos: Record<string, ServoState> = {}
    let lcd: LibraryState["lcd"] = null
    const oled: LibraryState["oled"] = {}
    const neopixels: LibraryState["neopixels"] = {}
    const peripherals = runner.getPeripheralBus().snapshot()
    for (const [id, s] of Object.entries(peripherals)) {
      if (s.kind === "servo") {
        servos[id] = { pin: s.pin, angle: s.angle }
        continue
      }
      if (s.kind === "lcd") {
        lcd = {
          pins: [],
          cols: s.cols,
          rows: s.rows,
          cursorCol: 0,
          cursorRow: 0,
          textBuffer: s.textBuffer,
          backlight: true,
          displayOn: true,
          cursorVisible: false,
          cursorBlink: false,
          direction: 1,
          autoscroll: false,
          scrollOffset: 0,
          cgram: [],
        }
        continue
      }
      if (s.kind === "oled") {
        oled[id] = {
          width: s.width,
          height: s.height,
          on: s.on,
          inverted: s.inverted,
          framebuffer: s.framebuffer,
        }
        continue
      }
      if (s.kind === "neopixel") {
        neopixels[id] = {
          pin: s.pin,
          pixels: s.pixels.map((p) => ({ r: p.r, g: p.g, b: p.b })),
        }
      }
    }

    // Simple serialization check to avoid unnecessary dispatches. The OLED
    // framebuffer is a number[] (not Uint8Array) precisely so this comparison
    // is meaningful — Uint8Array would JSON.stringify to `{}` and changes
    // would be silently dropped.
    const serialized = JSON.stringify({ servos, lcd, oled, neopixels })
    if (serialized === prevLibStateRef.current) return
    prevLibStateRef.current = serialized

    onLibChange({ servos, lcd, oled, neopixels })
  }, [])

  // Shared analysis result — updated inside the tick loop.
  // Also exposed globally so the circuit analysis hook can read it.
  const analysisResultRef = useRef<CircuitAnalysis | null>(null)
  latestSimAnalysisRef.current = analysisResultRef

  // Wall-clock timestamp of the last inline analysis, used to advance
  // capacitor charge/discharge in real time. Also tracks whether the board
  // currently has a capacitor so the tick loop can analyze it more often
  // (reactive transients need a higher update rate to animate smoothly).
  const lastInlineAtRef = useRef(0)
  const hasReactiveRef = useRef(false)

  /** Run circuit analysis and feed analog voltages into the pin store. */
  function runInlineAnalysis() {
    const ctx = boardActor.getSnapshot().context
    const hasCircuitComponents = Object.values(ctx.components).some(
      c => !isBoardComponentType(c.type) && c.type !== "wire"
    )
    if (!hasCircuitComponents) {
      analysisResultRef.current = null
      return
    }

    const runner = runnerRef.current
    if (!runner) return
    const store = runner.getPinStore()
    const boardTarget = ctx.boardTarget ?? DEFAULT_BOARD_TARGET
    const analogPinSet = new Set(
      getBoardPinLayout(boardTarget).analogPins.map((p) => p.pin),
    )

    // Surface 74HC595 parallel outputs to the circuit solver so its wired LEDs
    // light up. The chip's Q0..Q7 are not Arduino pins, so the netlist builder
    // can only drive them from the peripheral's latched byte.
    const shiftRegisterOutputs = new Map<string, readonly boolean[]>()
    for (const [id, s] of Object.entries(runner.getPeripheralBus().snapshot())) {
      if (s.kind === "shift_register") shiftRegisterOutputs.set(id, s.outputs)
    }

    // Real elapsed time since the last analysis, used to step capacitor
    // charge. Clamped so a stall (tab backgrounded, breakpoint) can't make a
    // cap lurch; first frame gets 0 (no step).
    hasReactiveRef.current = hasCapacitor(ctx.components)
    const now = performance.now()
    const dtSeconds = lastInlineAtRef.current
      ? Math.min((now - lastInlineAtRef.current) / 1000, 0.25)
      : 0
    lastInlineAtRef.current = now

    try {
      const result = analyzeCircuit(
        ctx.components,
        ctx.wires,
        snapshotAsPinStates(store),
        shiftRegisterOutputs,
        { dtSeconds },
      )
      analysisResultRef.current = result

      if (result.isValid) {
        const voltsToAnalog = (v: number) =>
          Math.round((Math.min(5, Math.abs(v)) / 5) * 1023)

        // Feed component voltages to analog pins.
        // 1. Explicit pin assignments
        for (const comp of Object.values(ctx.components)) {
          const compState = result.componentStates.get(comp.id)
          if (!compState) continue
          for (const [, pin] of Object.entries(comp.pins)) {
            if (pin !== null && analogPinSet.has(pin)) {
              store.writeExternal(pin, { analogValue: voltsToAnalog(compState.voltage) })
            }
          }
        }

        // 2. Wire-based: Arduino analog pin wires landing on component footprints
        for (const wire of Object.values(ctx.wires)) {
          if (wire.fromRow !== -999) continue
          const arduinoPin = wire.fromCol
          if (!analogPinSet.has(arduinoPin)) continue
          const wireTo = { row: wire.toRow, col: wire.toCol }
          for (const comp of Object.values(ctx.components)) {
            if (isBoardComponentType(comp.type) || comp.type === "wire") continue
            const compState = result.componentStates.get(comp.id)
            if (!compState) continue
            const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation, comp.properties)
            if (footprint.points.some(pt => areConnected(wireTo, pt))) {
              store.writeExternal(arduinoPin, { analogValue: voltsToAnalog(compState.voltage) })
              break
            }
          }
        }
      }
    } catch {
      analysisResultRef.current = null
    }

    // 3. Apply sensor-driven inputs LAST. Runs unconditionally — even when
    // circuit analysis fails or the board has no power rails — so active
    // sensors (ultrasonic, DHT, IR, photoresistor, PIR) still push their
    // inspector-driven values into the peripheral bus + pin store. Pass
    // the bus so `UltrasonicPeripheral.setDistance` runs and the AVR's
    // `pulseIn()` sees a real echo pulse.
    applySensorInputs(
      ctx.components,
      ctx.wires,
      store,
      ctx.environment,
      runner.getPeripheralBus(),
    )
  }

  const startLoop = useCallback(() => {
    cancelLoop()

    let frameCount = 0
    // Fresh run: drop any stale analysis timestamp so the first cap step is 0.
    lastInlineAtRef.current = 0

    function tick() {
      const runner = runnerRef.current
      if (!runner) return

      frameCount++

      // Run circuit analysis every 12 frames (~5 times/sec at 60fps). Boards
      // with a capacitor analyze every 2 frames (~30/sec) so charge/discharge
      // transients animate smoothly instead of snapping. Also run on the very
      // first frame so analog values are seeded.
      const interval = hasReactiveRef.current ? 2 : 12
      if (frameCount === 1 || frameCount % interval === 0) {
        runInlineAnalysis()
      }

      // Run loop iteration — it may return false if delaying.
      // External digital inputs (button press, etc.) go straight into the
      // PinStateStore via writeExternal() — no per-frame sync loop needed.
      runner.runLoopIteration()

      // Sync library state (servos, LCD) to board machine
      syncLibraryState()

      // Reconcile Web Audio with the buzzer peripheral state.
      syncAudioFromBus()

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
      const runToken = runTokenGateRef.current.beginRun()
      send({ type: "PLAY" })

      const runner = getRunner()
      runner.reset()
      resetSensorBuses()

      const boardCtx = boardActor.getSnapshot().context
      const customLibs = getCustomLibraryMap()
      const boardTarget = boardCtx.boardTarget ?? DEFAULT_BOARD_TARGET
      const fqbn = BOARD_TARGETS[boardTarget].fqbn
      const onLog = callbacksRef.current.onBuildLog
      runner.loadSketchAsync(sketchCode, customLibs, {
        fqbn,
        onLog: onLog
          ? (tag, line, ts) => {
              if (!runTokenGateRef.current.isCurrent(runToken)) return
              onLog(tag, line, ts)
            }
          : undefined,
      }).then((result) => {
        if (!runTokenGateRef.current.isCurrent(runToken)) return
        if (!result.success) {
          send({
            type: "COMPILE_ERROR",
            message: result.error ?? "Compilation failed",
          })
          return
        }
        // Populate the peripheral bus AFTER loadSketchAsync — it internally
        // calls reset() which wipes the bus, so anything attached earlier
        // would be lost. Peripherals need to exist before runSetup runs
        // because setup() can fire pin edges the bus must route.
        runner.attachBoard({
          components: boardCtx.components,
          wires: boardCtx.wires,
          pinStore: runner.getPinStore(),
        })
        send({ type: "COMPILE_SUCCESS" })
        runner.runSetup()
        startLoop()
      })
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
    // Invalidate any in-flight compile callbacks for prior runs.
    runTokenGateRef.current.invalidate()
    cancelLoop()
    stopAllTones()
    runnerRef.current?.reset()
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
      closeAudioContext()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelLoop])

  /** Feed text into the runner's Serial.read() buffer. */
  const sendSerialInput = useCallback((text: string) => {
    const runner = runnerRef.current
    if (!runner) return
    runner.sendSerialInput(text)
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
    runner: runnerRef.current,
  }
}

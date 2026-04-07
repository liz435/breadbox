import { useCallback, useRef } from "react"
import { Play, Pause, Square, Cpu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { LibraryState, Wire } from "@dreamer/schemas"
import { useBoard } from "@/store/board-context"
import { useDockviewApi } from "@/store/dockview-context"
import { useSimulation } from "@/simulator/simulation-loop"
import { useCircuitAnalysis } from "@/simulator/circuit-analysis-hook"
import { cn } from "@/utils/classnames"
import { markSerialUnread } from "./edit-toolbar"
import { getComponentFootprint, areConnected } from "@/breadboard/breadboard-grid"
import { simulationRef } from "@/simulator/simulation-ref"

export function PlayControls() {
  const { state, send: boardSend } = useBoard()
  const dockviewApi = useDockviewApi()

  const onPinWrite = useCallback(
    (pin: number, value: number, isPwm: boolean) => {
      boardSend({
        type: "SET_PIN_STATE",
        pin,
        changes: isPwm
          ? { pwmValue: value, isPwm: true }
          : { digitalValue: value },
      })
    },
    [boardSend],
  )

  const onPinMode = useCallback(
    (pin: number, mode: number) => {
      const modeMap: Record<number, "INPUT" | "OUTPUT" | "INPUT_PULLUP"> = {
        0: "INPUT",
        1: "OUTPUT",
        2: "INPUT_PULLUP",
      }
      boardSend({
        type: "SET_PIN_STATE",
        pin,
        changes: { mode: modeMap[mode] ?? "INPUT" },
      })
    },
    [boardSend],
  )

  const onSerialPrint = useCallback(
    (text: string) => {
      boardSend({ type: "APPEND_SERIAL", text })
      markSerialUnread()
    },
    [boardSend],
  )

  const onLibraryStateChange = useCallback(
    (changes: Partial<LibraryState>) => {
      boardSend({ type: "SET_LIBRARY_STATE", changes })
    },
    [boardSend],
  )

  // Feed circuit analysis voltages into analogRead()
  const { analysis } = useCircuitAnalysis()
  const analysisRef = useRef(analysis)
  analysisRef.current = analysis

  const stateRef = useRef(state)
  stateRef.current = state

  const getAnalogInputs = useCallback((): Map<number, number> | null => {
    const a = analysisRef.current
    const s = stateRef.current
    if (!a || !a.isValid) return null
    const result = new Map<number, number>()

    // 1. Explicit pin assignments: component.pins has an analog pin (14-19)
    for (const comp of Object.values(s.components)) {
      const compState = a.componentStates.get(comp.id)
      if (!compState) continue
      for (const [, pin] of Object.entries(comp.pins)) {
        if (pin !== null && pin >= 14 && pin <= 19) {
          result.set(pin, Math.min(5, Math.abs(compState.voltage)))
        }
      }
    }

    // 2. Wire-based: Arduino analog pin wires that land on a component's footprint net.
    // Find wires from Arduino analog pins (fromRow=-999, fromCol=14..19)
    for (const wire of Object.values(s.wires)) {
      if (wire.fromRow !== -999) continue
      const arduinoPin = wire.fromCol
      if (arduinoPin < 14 || arduinoPin > 19) continue
      if (result.has(arduinoPin)) continue // already set by explicit assignment

      const wireTo = { row: wire.toRow, col: wire.toCol }
      // Find which component footprint point is on the same breadboard bus
      for (const comp of Object.values(s.components)) {
        if (comp.type === "arduino_uno" || comp.type === "wire") continue
        const compState = a.componentStates.get(comp.id)
        if (!compState) continue
        const footprint = getComponentFootprint(comp.type, comp.y, comp.x, comp.rotation)
        const connected = footprint.points.some(pt => areConnected(wireTo, pt))
        if (connected) {
          result.set(arduinoPin, Math.min(5, Math.abs(compState.voltage)))
          break
        }
      }
    }

    return result.size > 0 ? result : null
  }, [])

  const sim = useSimulation({
    onPinWrite,
    onPinMode,
    onSerialPrint,
    onLibraryStateChange,
    getAnalogInputs,
  })
  const { status, error, play, pause, resume, stop } = sim

  // Expose the simulation globally so the sketch editor can use the same instance
  simulationRef.current = sim

  const sketchCodeRef = useRef(state.sketchCode)
  sketchCodeRef.current = state.sketchCode

  const handlePlay = useCallback(() => {
    if (status === "paused") {
      resume()
      return
    }
    play(sketchCodeRef.current)

    // Auto-open serial monitor panel
    if (dockviewApi) {
      const existing = dockviewApi.getPanel("serialMonitor")
      if (!existing) {
        const breadboard = dockviewApi.getPanel("breadboard")
        dockviewApi.addPanel({
          id: "serialMonitor",
          component: "serialMonitor",
          title: "Serial Monitor",
          position: breadboard
            ? { referencePanel: breadboard, direction: "below" }
            : { direction: "below" },
        })
      }
    }
  }, [status, play, resume, dockviewApi])

  const handlePause = useCallback(() => {
    pause()
  }, [pause])

  const handleStop = useCallback(() => {
    stop()
    boardSend({ type: "RESET_PINS" })
  }, [stop, boardSend])

  const isRunning = status === "running"
  const isPaused = status === "paused"
  const isCompiling = status === "compiling"
  const isStopped = status === "stopped"
  const isError = status === "error"

  return (
    <div className="flex items-center gap-1">
      {/* Compile + Play button */}
      {isRunning ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={handlePause} />
            }
          >
            <Pause className="size-3.5 text-yellow-400" />
          </TooltipTrigger>
          <TooltipContent>Pause</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePlay}
                disabled={isCompiling}
              />
            }
          >
            {isCompiling ? (
              <Cpu className="size-3.5 animate-pulse text-blue-400" />
            ) : (
              <Play
                className={cn(
                  "size-3.5",
                  isPaused ? "text-yellow-400" : "text-green-400",
                )}
              />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {isPaused ? "Resume" : isCompiling ? "Compiling..." : "Compile & Run"}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Stop button */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStop}
              disabled={isStopped}
            />
          }
        >
          <Square
            className={cn(
              "size-3.5",
              isStopped ? "text-zinc-600" : "text-red-400",
            )}
          />
        </TooltipTrigger>
        <TooltipContent>Stop</TooltipContent>
      </Tooltip>

      {/* Status text */}
      {!isStopped && (
        <span className="ml-1 text-[10px] tabular-nums text-neutral-400">
          {status}
        </span>
      )}

      {/* Error message */}
      {isError && error && (
        <span className="ml-1 max-w-[200px] truncate text-[10px] text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}

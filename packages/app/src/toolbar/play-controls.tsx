import { useCallback, useRef, useEffect } from "react"
import { Play, Pause, Square, Cpu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useBoard } from "@/store/board-context"
import { useDockviewApi } from "@/store/dockview-context"
import { useSimulation } from "@/simulator/simulation-loop"
import { cn } from "@/utils/classnames"

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
    },
    [boardSend],
  )

  const { status, error, play, pause, resume, stop } = useSimulation({
    onPinWrite,
    onPinMode,
    onSerialPrint,
  })

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

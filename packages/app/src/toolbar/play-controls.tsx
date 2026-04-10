import { useCallback, useRef, useState } from "react"
import { Play, Pause, Square, Cpu, Upload, Zap, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { LibraryState } from "@dreamer/schemas"
import { useBoard } from "@/store/board-context"
import { useDockviewApi } from "@/store/dockview-context"
import { useSimulation } from "@/simulator/simulation-loop"
import { useBoardConnection } from "@/simulator/use-board-connection"
import { cn } from "@/utils/classnames"
import { markSerialUnread } from "./edit-toolbar"
import { simulationRef } from "@/simulator/simulation-ref"

const API = "http://localhost:4111"

type UploadStatus = "idle" | "compiling" | "flashing" | "reconnecting" | "done" | "error"

export function PlayControls() {
  const { state, send: boardSend } = useBoard()
  const dockviewApi = useDockviewApi()
  const { selectedPort } = useBoardConnection()
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle")
  const [uploadError, setUploadError] = useState<string | null>(null)

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

  const sim = useSimulation({
    onSerialPrint,
    onLibraryStateChange,
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

  const handleUpload = useCallback(async () => {
    if (!selectedPort || !sketchCodeRef.current) return
    setUploadError(null)
    setUploadStatus("compiling")
    try {
      const res = await fetch(`${API}/api/flash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: selectedPort, code: sketchCodeRef.current }),
      })
      const data = (await res.json()) as { success?: boolean; stage?: string; error?: string }
      if (!data.success) {
        setUploadError(data.error ?? "Upload failed")
        setUploadStatus("error")
        return
      }
      setUploadStatus("reconnecting")
      // board-manager handles reconnect; status resets after 3s
      setTimeout(() => setUploadStatus("idle"), 3_500)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed")
      setUploadStatus("error")
    }
  }, [selectedPort])

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

      {/* Upload to Arduino — only shown when a port is selected */}
      {selectedPort && (
        <>
          <div className="mx-1 h-4 w-px bg-zinc-700" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleUpload}
                  disabled={uploadStatus === "compiling" || uploadStatus === "flashing" || uploadStatus === "reconnecting"}
                />
              }
            >
              {uploadStatus === "compiling" && (
                <Cpu className="size-3.5 animate-pulse text-blue-400" />
              )}
              {uploadStatus === "flashing" && (
                <Zap className="size-3.5 animate-pulse text-teal-400" />
              )}
              {uploadStatus === "reconnecting" && (
                <Upload className="size-3.5 animate-pulse text-teal-300" />
              )}
              {uploadStatus === "error" && (
                <AlertCircle className="size-3.5 text-red-400" />
              )}
              {(uploadStatus === "idle" || uploadStatus === "done") && (
                <Upload className="size-3.5 text-teal-400" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {uploadStatus === "compiling" ? "Compiling…"
                : uploadStatus === "flashing" ? "Flashing…"
                : uploadStatus === "reconnecting" ? "Reconnecting…"
                : uploadStatus === "error" ? (uploadError ?? "Upload failed")
                : "Compile & Upload to Arduino"}
            </TooltipContent>
          </Tooltip>

          {uploadStatus === "error" && uploadError && (
            <span className="ml-1 max-w-[160px] truncate text-[10px] text-red-400" title={uploadError}>
              {uploadError}
            </span>
          )}
        </>
      )}
    </div>
  )
}

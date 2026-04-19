import { useCallback, useRef } from "react"
import { Play, Pause, Square, Cpu, Upload, Zap, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { BOARD_TARGETS, DEFAULT_BOARD_TARGET, type BoardTarget } from "@dreamer/schemas"
import { API_ORIGIN } from "@dreamer/config"
import { useBoard } from "@/store/board-context"
import { useDockviewApi } from "@/store/dockview-context"
import type { SimulationActions } from "@/simulator/simulation-loop"
import { useBoardConnection } from "@/simulator/use-board-connection"
import { useElectricalReport } from "@/electrical/power-budget"
import { cn } from "@/utils/classnames"
import { readNdjsonStream } from "@/simulator/avr-compiler"
import { setUploadState, useUploadState } from "./upload-status-store"
import { BoardStatus } from "./board-status"

type PlayControlsProps = {
  sim: SimulationActions
}

export function PlayControls({ sim }: PlayControlsProps) {
  const { state, send: boardSend } = useBoard()
  const dockviewApi = useDockviewApi()
  const { selectedPort } = useBoardConnection()
  const electrical = useElectricalReport()
  const upload = useUploadState()

  const { status, play, pause, resume, stop } = sim

  const sketchCodeRef = useRef(state.sketchCode)
  sketchCodeRef.current = state.sketchCode
  const boardTarget = (state.boardTarget ?? DEFAULT_BOARD_TARGET) as BoardTarget
  const boardTargetInfo = BOARD_TARGETS[boardTarget]

  const handlePlay = useCallback(() => {
    if (electrical.hasErrors) return
    if (status === "paused") {
      resume()
      return
    }
    // Drop the previous compile log so the panel shows only this run's
    // output — matches the "keep until next compile" contract.
    boardSend({ type: "CLEAR_BUILD_LOG" })
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
  }, [electrical.hasErrors, status, play, resume, dockviewApi, boardSend])

  const handlePause = useCallback(() => {
    pause()
  }, [pause])

  const handleStop = useCallback(() => {
    stop()
    boardSend({ type: "RESET_PINS" })
  }, [stop, boardSend])

  const handleUpload = useCallback(async () => {
    if (electrical.hasErrors) return
    if (!selectedPort || !sketchCodeRef.current) return
    setUploadState({ status: "compiling", error: null })
    // Fresh panel for this upload session — compile + upload logs stream in.
    boardSend({ type: "CLEAR_BUILD_LOG" })
    try {
      const res = await fetch(`${API_ORIGIN}/api/flash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: selectedPort,
          code: sketchCodeRef.current,
          boardTarget,
          fqbn: boardTargetInfo.fqbn,
        }),
      })

      // Schema-validation failures and other non-streaming errors still come
      // back as plain JSON with a 4xx/5xx status — handle those up front.
      const contentType = res.headers.get("content-type") ?? ""
      if (!contentType.includes("ndjson")) {
        const body = (await res.json()) as { error?: string }
        setUploadState({
          status: "error",
          error: body.error ?? `Upload server returned ${res.status}`,
        })
        return
      }
      if (!res.body) {
        setUploadState({ status: "error", error: "Upload server returned empty body" })
        return
      }

      type FlashEvent =
        | { kind: "log"; tag: "compiler" | "upload"; line: string; ts: number }
        | { kind: "done"; stage?: string }
        | { kind: "error"; stage?: string; message: string }

      let errorMessage: string | undefined
      let flashed = false
      let sawUploadPhase = false

      for await (const event of readNdjsonStream<FlashEvent>(res.body)) {
        if (event.kind === "log") {
          boardSend({ type: "APPEND_BUILD_LOG", tag: event.tag, line: event.line, ts: event.ts })
          if (event.tag === "upload" && !sawUploadPhase) {
            sawUploadPhase = true
            setUploadState({ status: "flashing" })
          }
        } else if (event.kind === "done") {
          flashed = true
        } else if (event.kind === "error") {
          errorMessage = event.message
        }
      }

      if (!flashed || errorMessage) {
        setUploadState({ status: "error", error: errorMessage ?? "Upload failed" })
        return
      }

      setUploadState({ status: "reconnecting", error: null })
      // board-manager handles reconnect; status resets after 3s
      setTimeout(() => setUploadState({ status: "idle", error: null }), 3_500)
    } catch (err) {
      setUploadState({
        status: "error",
        error: err instanceof Error ? err.message : "Upload failed",
      })
    }
  }, [electrical.hasErrors, selectedPort, boardTarget, boardTargetInfo.fqbn, boardSend])

  const isRunning = status === "running"
  const isPaused = status === "paused"
  const isCompiling = status === "compiling"
  const isStopped = status === "stopped"
  const electricalBlockReason = electrical.issues.find((issue) => issue.severity === "error")?.message

  const uploadInProgress =
    upload.status === "compiling" ||
    upload.status === "flashing" ||
    upload.status === "reconnecting"

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
                disabled={isCompiling || electrical.hasErrors}
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
            {electrical.hasErrors
              ? "Electrical issue blocks Run"
              : isPaused ? "Resume" : isCompiling ? "Compiling..." : "Compile & Run"}
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

      {/* USB / port picker — opens a popover listing available Arduino
          serial ports. Replaces the old "No board" text pill. */}
      <BoardStatus />

      {/* Upload to Arduino — only shown when a port is selected. Inline status
          text used to live here; it now renders in <StatusDisplay/>. */}
      {selectedPort && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={handleUpload}
                disabled={electrical.hasErrors || uploadInProgress}
              />
            }
          >
            {upload.status === "compiling" && (
              <Cpu className="size-3.5 animate-pulse text-blue-400" />
            )}
            {upload.status === "flashing" && (
              <Zap className="size-3.5 animate-pulse text-teal-400" />
            )}
            {upload.status === "reconnecting" && (
              <Upload className="size-3.5 animate-pulse text-teal-300" />
            )}
            {upload.status === "error" && (
              <AlertCircle className="size-3.5 text-red-400" />
            )}
            {(upload.status === "idle" || upload.status === "done") && (
              <Upload className="size-3.5 text-teal-400" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {upload.status === "compiling" ? "Compiling…"
              : upload.status === "flashing" ? "Flashing…"
              : upload.status === "reconnecting" ? "Reconnecting…"
              : electrical.hasErrors ? (electricalBlockReason ?? "Electrical issue blocks upload")
              : upload.status === "error" ? (upload.error ?? "Upload failed")
              : `Compile & Upload (${boardTargetInfo.label})`}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

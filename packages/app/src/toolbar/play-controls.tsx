import { useCallback, useRef, useState } from "react"
import { Play, Pause, Square, Cpu, Upload, Zap, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { BOARD_TARGETS, DEFAULT_BOARD_TARGET, type BoardTarget, type LibraryState } from "@dreamer/schemas"
import { API_ORIGIN } from "@dreamer/config"
import { useBoard } from "@/store/board-context"
import { useDockviewApi } from "@/store/dockview-context"
import { useSimulation } from "@/simulator/simulation-loop"
import { useBoardConnection } from "@/simulator/use-board-connection"
import { useElectricalReport } from "@/electrical/power-budget"
import { cn } from "@/utils/classnames"
import { markSerialUnread } from "./edit-toolbar"
import { simulationRef } from "@/simulator/simulation-ref"
import { readNdjsonStream } from "@/simulator/avr-compiler"

type UploadStatus = "idle" | "compiling" | "flashing" | "reconnecting" | "done" | "error"

export function PlayControls() {
  const { state, send: boardSend } = useBoard()
  const dockviewApi = useDockviewApi()
  const { selectedPort } = useBoardConnection()
  const electrical = useElectricalReport()
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

  const onBuildLog = useCallback(
    (tag: "compiler" | "upload", line: string, ts: number) => {
      boardSend({ type: "APPEND_BUILD_LOG", tag, line, ts })
    },
    [boardSend],
  )

  const sim = useSimulation({
    onSerialPrint,
    onLibraryStateChange,
    onBuildLog,
  })
  const { status, error, play, pause, resume, stop } = sim

  // Expose the simulation globally so the sketch editor can use the same instance
  simulationRef.current = sim

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
    setUploadError(null)
    setUploadStatus("compiling")
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
        setUploadError(body.error ?? `Upload server returned ${res.status}`)
        setUploadStatus("error")
        return
      }
      if (!res.body) {
        setUploadError("Upload server returned empty body")
        setUploadStatus("error")
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
            setUploadStatus("flashing")
          }
        } else if (event.kind === "done") {
          flashed = true
        } else if (event.kind === "error") {
          errorMessage = event.message
        }
      }

      if (!flashed || errorMessage) {
        setUploadError(errorMessage ?? "Upload failed")
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
  }, [electrical.hasErrors, selectedPort, boardTarget, boardTargetInfo.fqbn, boardSend])

  const isRunning = status === "running"
  const isPaused = status === "paused"
  const isCompiling = status === "compiling"
  const isStopped = status === "stopped"
  const isError = status === "error"
  const electricalBlockReason = electrical.issues.find((issue) => issue.severity === "error")?.message

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

      {/* Status text */}
      {!isStopped && (
        <span className="ml-1 text-[10px] tabular-nums text-neutral-400">
          {status}
        </span>
      )}
      {boardTargetInfo.runner === "compile-only" && (
        <span
          className="ml-1 text-[10px] text-amber-400"
          title="This board has no in-browser emulator. Compile + upload to hardware still works via board-specific FQBN."
        >
          not simulated
        </span>
      )}

      {/* Error indicator */}
      {isError && error && (
        <span className="ml-1 text-[10px] text-red-400" title={error}>
          error
        </span>
      )}
      {electrical.hasErrors && electricalBlockReason && (
        <span className="ml-1 text-[10px] text-red-400" title={electricalBlockReason}>
          error
        </span>
      )}

      <div className="mx-1 h-4 w-px bg-zinc-700" />
      <select
        value={boardTarget}
        onChange={(e) => boardSend({ type: "SET_BOARD_TARGET", boardTarget: e.target.value as BoardTarget })}
        className="h-6 rounded border border-zinc-700 bg-zinc-900 px-2 text-[10px] text-zinc-200"
        title={`${boardTargetInfo.label} • ${boardTargetInfo.mcu}`}
      >
        {Object.values(BOARD_TARGETS).map((target) => (
          <option key={target.id} value={target.id}>
            {target.label}
          </option>
        ))}
      </select>

      {/* Upload to Arduino — only shown when a port is selected */}
      {selectedPort && (
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleUpload}
                  disabled={
                    electrical.hasErrors ||
                    uploadStatus === "compiling" ||
                    uploadStatus === "flashing" ||
                    uploadStatus === "reconnecting"
                  }
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
                : electrical.hasErrors ? (electricalBlockReason ?? "Electrical issue blocks upload")
                : uploadStatus === "error" ? (uploadError ?? "Upload failed")
                : `Compile & Upload (${boardTargetInfo.label})`}
            </TooltipContent>
          </Tooltip>

          {uploadStatus === "error" && uploadError && (
            <span className="ml-1 text-[10px] text-red-400" title={uploadError}>
              error
            </span>
          )}
        </>
      )}
    </div>
  )
}

import { useCallback, useRef } from "react"
import { Play, Square, Cpu, Upload, Zap, AlertCircle } from "lucide-react"
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
import { compileSketch, readNdjsonStream } from "@/simulator/avr-compiler"
import { resolveFetchOptions } from "@/project/api-client"
import { useCapabilities } from "@/project/use-capabilities"
import { usePairedPort } from "@/simulator/web-serial-port-store"
import { isWebSerialSupported } from "@/simulator/web-serial-types"
import { flashViaStk500v1 } from "@/simulator/stk500-uploader"
import { setUploadState, useUploadState } from "./upload-status-store"

type PlayControlsProps = {
  sim: SimulationActions
}

export function PlayControls({ sim }: PlayControlsProps) {
  const { state, send: boardSend } = useBoard()
  const dockviewApi = useDockviewApi()
  const { selectedPort } = useBoardConnection()
  const { capabilities } = useCapabilities()
  const { port: pairedPort } = usePairedPort()
  const electrical = useElectricalReport()
  const upload = useUploadState()

  const { status, play, resume, stop } = sim

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

  const handleStop = useCallback(() => {
    stop()
    boardSend({ type: "RESET_PINS" })
  }, [stop, boardSend])

  const handleUpload = useCallback(async () => {
    if (electrical.hasErrors) return
    if (!sketchCodeRef.current) return

    // Hosted has no USB on the server; flash via WebSerial directly from
    // the browser. Local mode keeps the existing server-driven path so
    // CLI users get unchanged behavior.
    if (capabilities.hosted) {
      if (!pairedPort) return
      const uploadParams = boardTargetInfo.webSerialUpload
      if (!uploadParams) {
        setUploadState({
          status: "error",
          error: `${boardTargetInfo.label} can't yet be flashed from the browser`,
        })
        return
      }

      setUploadState({ status: "compiling", error: null })
      boardSend({ type: "CLEAR_BUILD_LOG" })
      try {
        const compile = await compileSketch(sketchCodeRef.current, {
          fqbn: boardTargetInfo.fqbn,
          onLog: (tag, line, ts) => boardSend({ type: "APPEND_BUILD_LOG", tag, line, ts }),
        })
        if (!compile.success) {
          setUploadState({ status: "error", error: compile.error })
          return
        }
        if (compile.format !== "hex") {
          setUploadState({
            status: "error",
            error: "Browser flashing currently only supports Intel HEX (Uno/Nano). Pico support is coming soon.",
          })
          return
        }

        setUploadState({ status: "flashing", error: null })
        await flashViaStk500v1({
          hexText: compile.hexText,
          baudRate: uploadParams.baudRate,
          pageSize: uploadParams.pageSize,
          onLog: (line) =>
            boardSend({ type: "APPEND_BUILD_LOG", tag: "upload", line, ts: Date.now() }),
          onProgress: () => { /* progress bar TBD */ },
        })

        setUploadState({ status: "reconnecting", error: null })
        // SerialMonitor (via web-serial-board.ts) reopens at the remembered
        // baud once status leaves "flashing"; reset to idle so the button
        // becomes clickable again. 1.5s matches Optiboot's post-reset boot.
        setTimeout(() => setUploadState({ status: "idle", error: null }), 1_500)
      } catch (err) {
        setUploadState({
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        })
      }
      return
    }

    // Local path: server-side arduino-cli upload.
    if (!selectedPort) return
    setUploadState({ status: "compiling", error: null })
    // Fresh panel for this upload session — compile + upload logs stream in.
    boardSend({ type: "CLEAR_BUILD_LOG" })
    try {
      const res = await fetch(
        `${API_ORIGIN}/api/flash`,
        resolveFetchOptions({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            port: selectedPort,
            code: sketchCodeRef.current,
            boardTarget,
            fqbn: boardTargetInfo.fqbn,
          }),
        }),
      )

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
  }, [
    electrical.hasErrors,
    selectedPort,
    boardTarget,
    boardTargetInfo,
    boardSend,
    capabilities.hosted,
    pairedPort,
  ])

  const isRunning = status === "running"
  const isPaused = status === "paused"
  const isCompiling = status === "compiling"
  const electricalBlockReason = electrical.issues.find((issue) => issue.severity === "error")?.message

  const uploadInProgress =
    upload.status === "compiling" ||
    upload.status === "flashing" ||
    upload.status === "reconnecting"

  // On hosted the Upload button is always visible (so the user has a clear
  // place to land when they haven't paired yet — the disabled tooltip
  // tells them what to do). On local we keep the historical rule of
  // hiding the button until the user picks a server-detected port.
  const webSerialOk = capabilities.hosted && isWebSerialSupported()
  const showUpload = capabilities.hosted ? true : !!selectedPort
  const canUpload = capabilities.hosted
    ? (webSerialOk && !!pairedPort && !!boardTargetInfo.webSerialUpload)
    : !!selectedPort
  const uploadDisabledReason: string | null = !capabilities.hosted
    ? null
    : !isWebSerialSupported()
      ? "Use Chrome or Edge to flash a board"
      : !pairedPort
        ? "Pair a board first"
        : !boardTargetInfo.webSerialUpload
          ? `${boardTargetInfo.label} can't yet be flashed from the browser`
          : null

  return (
    <div className="flex items-center gap-1">
      {/* Play / Stop toggle — one button: Play when stopped, Stop while running */}
      {isRunning ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={handleStop} className="size-9 rounded-xl transition-all duration-150 active:scale-90" />
            }
          >
            <Square className="size-3.5 text-red-400" />
          </TooltipTrigger>
          <TooltipContent>Stop</TooltipContent>
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
                className="size-9 rounded-xl transition-all duration-150 active:scale-90"
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

      {/* USB / port picker was rendered here historically; moved to the
          right-edge status cluster (next to StatusDisplay) in
          bottom-toolbar.tsx so the board + status read as one unit. */}

      {/* Upload to Arduino — visible on hosted (so user sees where to pair),
          gated on a selected port locally. Inline status text used to live
          here; it now renders in <StatusDisplay/>. */}
      {showUpload && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={handleUpload}
                disabled={electrical.hasErrors || uploadInProgress || !canUpload}
                className="size-9 rounded-xl transition-all duration-150 active:scale-90"
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
              : uploadDisabledReason
                ? uploadDisabledReason
                : `Compile & Upload (${boardTargetInfo.label})`}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

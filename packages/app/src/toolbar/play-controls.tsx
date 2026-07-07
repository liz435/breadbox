import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Square, Cpu, Upload, Zap, AlertCircle, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { BOARD_TARGETS, DEFAULT_BOARD_TARGET, type BoardTarget } from "@dreamer/schemas"
import { API_ORIGIN } from "@dreamer/config"
import { useBoard } from "@/store/board-context"
import { useDockviewApi } from "@/store/dockview-context"
import type { SimulationActions } from "@/simulator/simulation-loop"
import { getCircuitRealtimeFactor } from "@/simulator/solver-scheduler"
import { useBoardConnection } from "@/simulator/use-board-connection"
import { useElectricalReport } from "@/electrical/power-budget"
import { cn } from "@/utils/classnames"
import { compileSketch, readNdjsonStream } from "@/simulator/avr-compiler"
import { resolveFetchOptions } from "@/project/api-client"
import { useCapabilities } from "@/project/use-capabilities"
import { usePairedPort } from "@/simulator/web-serial-port-store"
import { isWebSerialSupported } from "@/simulator/web-serial-types"
import { flashViaStk500v1 } from "@/simulator/stk500-uploader"
import { downloadUf2 } from "@/simulator/uf2-download"
import { setUploadState, useUploadState } from "./upload-status-store"

type PlayControlsProps = {
  sim: SimulationActions
}

/** Show the lag badge only when the sim is meaningfully behind real time. */
const REALTIME_BADGE_THRESHOLD = 0.9

/**
 * Poll the running sketch's sim-vs-wall speed ratio (~1 Hz). The emulator
 * runs a fixed cycle budget per frame with no catch-up, so dropped frames
 * silently slow the MCU — this makes that visible instead of letting users
 * mistake a lagging sim for real-time behavior.
 *
 * Two timelines can lag: the MCU (dropped frames) and the circuit solver
 * (heavy transient integration under the Phase B lockstep). The badge shows
 * whichever is slower — that is the speed the unified sim actually runs at.
 */
function useRealtimeFactor(runner: SimulationActions["runner"], isRunning: boolean): number | null {
  const [factor, setFactor] = useState<number | null>(null)
  useEffect(() => {
    if (!isRunning) {
      setFactor(null)
      return
    }
    const id = setInterval(() => {
      const mcu = runner?.getRealtimeFactor?.() ?? null
      const circuit = getCircuitRealtimeFactor()
      if (mcu === null && circuit === null) {
        setFactor(null)
        return
      }
      setFactor(Math.min(mcu ?? 1, circuit ?? 1))
    }, 1000)
    return () => clearInterval(id)
  }, [runner, isRunning])
  return factor
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

    // RP2040 boards flash via BOOTSEL mass storage, not a serial bootloader:
    // compile to .uf2 and download it for the user to drop onto the RPI-RP2
    // drive. Works identically on hosted and local (no USB/port needed).
    if (boardTargetInfo.uf2Download) {
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
        if (compile.format !== "uf2") {
          setUploadState({
            status: "error",
            error: `${boardTargetInfo.label} expected UF2 firmware but the compiler returned "${compile.format}".`,
          })
          return
        }
        downloadUf2(compile.uf2Base64, "sketch.uf2")
        boardSend({
          type: "APPEND_BUILD_LOG",
          tag: "upload",
          line:
            "Downloaded sketch.uf2 — hold BOOTSEL, plug in the board, then drop the file onto the RPI-RP2 drive.",
          ts: Date.now(),
        })
        setUploadState({ status: "done", error: null })
        setTimeout(() => setUploadState({ status: "idle", error: null }), 4_000)
      } catch (err) {
        setUploadState({
          status: "error",
          error: err instanceof Error ? err.message : "UF2 build failed",
        })
      }
      return
    }

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
  const realtimeFactor = useRealtimeFactor(sim.runner, isRunning)
  const showLagBadge =
    isRunning && realtimeFactor !== null && realtimeFactor < REALTIME_BADGE_THRESHOLD
  const electricalBlockReason = electrical.issues.find((issue) => issue.severity === "error")?.message

  const uploadInProgress =
    upload.status === "compiling" ||
    upload.status === "flashing" ||
    upload.status === "reconnecting"

  // The Upload button is always visible so it reads as a stable, findable
  // control — it just grays out (disabled) until upload is actually possible,
  // and the tooltip explains what's missing (no board paired/connected, wrong
  // browser, etc.). UF2 boards (Pico) download a file — no USB pairing or
  // server port needed — so they're always uploadable.
  const isUf2Download = !!boardTargetInfo.uf2Download
  const webSerialOk = capabilities.hosted && isWebSerialSupported()
  const canUpload = isUf2Download
    ? true
    : capabilities.hosted
      ? (webSerialOk && !!pairedPort && !!boardTargetInfo.webSerialUpload)
      : !!selectedPort
  const uploadDisabledReason: string | null = isUf2Download
    ? null
    : !capabilities.hosted
      ? (!selectedPort ? "Connect a board to upload" : null)
      : !isWebSerialSupported()
        ? "Use Chrome or Edge to flash a board"
        : !pairedPort
          ? "Pair a board first"
          : !boardTargetInfo.webSerialUpload
            ? `${boardTargetInfo.label} can't yet be flashed from the browser`
            : null

  // Drive the disabled *look* + click-guard ourselves via aria-disabled instead
  // of the native `disabled` attribute: a natively-disabled button gets
  // pointer-events-none, which would swallow hover and hide the tooltip — but
  // the tooltip is exactly where we explain *why* it's disabled (no board yet).
  const uploadDisabled = electrical.hasErrors || uploadInProgress || !canUpload

  return (
    <div data-onboarding="run" className="flex items-center gap-1">
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
                  "fill-current",
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

      {/* Sim-speed lag badge — visible only when the emulator falls behind
          real time, so timing-sensitive results aren't mistaken for 1×. */}
      {showLagBadge && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-400" />
            }
          >
            {realtimeFactor.toFixed(1)}×
          </TooltipTrigger>
          <TooltipContent>
            Simulation is running at ~{realtimeFactor.toFixed(1)}× real time — delays, tones and
            pulse timing stretch accordingly.
          </TooltipContent>
        </Tooltip>
      )}

      {/* USB / port picker was rendered here historically; moved to the
          right-edge status cluster (next to StatusDisplay) in
          bottom-toolbar.tsx so the board + status read as one unit. */}

      {/* Upload to Arduino — always visible; disabled (grayed) until a board is
          connected/paired, with the reason in the tooltip. Inline status text
          renders in <StatusDisplay/>. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={uploadDisabled ? undefined : handleUpload}
              aria-disabled={uploadDisabled}
              className={cn(
                "size-9 rounded-xl transition-all duration-150",
                uploadDisabled
                  ? "cursor-not-allowed opacity-50 hover:bg-transparent"
                  : "active:scale-90",
              )}
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
          {(upload.status === "idle" || upload.status === "done") &&
            (isUf2Download ? (
              <Download className="size-3.5 text-muted-foreground" />
            ) : (
              <Upload className="size-3.5 text-muted-foreground" />
            ))}
        </TooltipTrigger>
        <TooltipContent>
          {upload.status === "compiling" ? "Compiling…"
            : upload.status === "flashing" ? "Flashing…"
            : upload.status === "reconnecting" ? "Reconnecting…"
            : electrical.hasErrors ? (electricalBlockReason ?? "Electrical issue blocks upload")
            : upload.status === "error" ? (upload.error ?? "Upload failed")
            : uploadDisabledReason
              ? uploadDisabledReason
              : isUf2Download
                ? `Compile & download .uf2 (${boardTargetInfo.label})`
                : `Compile & Upload (${boardTargetInfo.label})`}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

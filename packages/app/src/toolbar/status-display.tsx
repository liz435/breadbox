// ── Status Display ────────────────────────────────────────────────────────
//
// Fixed-width status pill that lives in the bottom toolbar. It consolidates
// every transient status the toolbar used to render inline (simulation state,
// simulation errors, electrical issues, "not simulated" warnings, upload
// progress + errors). A single dedicated slot means the toolbar's overall
// width stays stable — the message truncates with an ellipsis instead of
// reflowing the surrounding controls.

import { BOARD_TARGETS, DEFAULT_BOARD_TARGET, type BoardTarget } from "@dreamer/schemas"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useBoard } from "@/store/board-context"
import type { SimulationActions } from "@/simulator/simulation-loop"
import { useElectricalReport } from "@/electrical/power-budget"
import { useUploadState } from "./upload-status-store"
import { BoardSelector } from "./board-selector"
import { cn } from "@/utils/classnames"

type Tone = "neutral" | "info" | "success" | "warning" | "error"

type StatusInfo = {
  tone: Tone
  label: string
  detail?: string
}

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-blue-400 animate-pulse",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  error: "bg-red-400",
}

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  info: "text-blue-300",
  success: "text-emerald-300",
  warning: "text-amber-300",
  error: "text-red-300",
}

function deriveStatus(args: {
  simStatus: SimulationActions["status"]
  simError: SimulationActions["error"]
  uploadStatus: ReturnType<typeof useUploadState>["status"]
  uploadError: ReturnType<typeof useUploadState>["error"]
  electricalBlock: string | null
  notSimulated: boolean
  boardLabel: string
}): StatusInfo {
  const {
    simStatus,
    simError,
    uploadStatus,
    uploadError,
    electricalBlock,
    notSimulated,
    boardLabel,
  } = args

  // Upload phases take priority — they're explicit user-initiated actions.
  if (uploadStatus === "compiling") return { tone: "info", label: "Compiling…" }
  if (uploadStatus === "flashing") return { tone: "info", label: "Flashing…" }
  if (uploadStatus === "reconnecting") return { tone: "info", label: "Reconnecting…" }
  if (uploadStatus === "error") {
    return { tone: "error", label: "Upload failed", detail: uploadError ?? undefined }
  }
  if (uploadStatus === "done") return { tone: "success", label: "Uploaded" }

  // Simulation errors and electrical blockers are next.
  if (simStatus === "error") {
    return { tone: "error", label: "Sim error", detail: simError ?? undefined }
  }
  if (electricalBlock) {
    return { tone: "error", label: "Electrical issue", detail: electricalBlock }
  }

  // Active sim states.
  if (simStatus === "compiling") return { tone: "info", label: "Compiling…" }
  if (simStatus === "running") return { tone: "success", label: "Running" }
  if (simStatus === "paused") return { tone: "warning", label: "Paused" }

  // Stopped or idle — surface the board context.
  if (notSimulated) {
    return {
      tone: "warning",
      label: "Hardware only",
      detail: `${boardLabel} has no in-browser simulator. Compile + upload still works.`,
    }
  }
  return { tone: "neutral", label: boardLabel }
}

type StatusDisplayProps = {
  sim: SimulationActions
}

export function StatusDisplay({ sim }: StatusDisplayProps) {
  const { state } = useBoard()
  const electrical = useElectricalReport()
  const upload = useUploadState()

  const boardTarget = (state.boardTarget ?? DEFAULT_BOARD_TARGET) as BoardTarget
  const boardInfo = BOARD_TARGETS[boardTarget]
  const electricalBlock =
    electrical.issues.find((issue) => issue.severity === "error")?.message ?? null

  const info = deriveStatus({
    simStatus: sim.status,
    simError: sim.error,
    uploadStatus: upload.status,
    uploadError: upload.error,
    electricalBlock,
    notSimulated: boardInfo.runner === "compile-only",
    boardLabel: boardInfo.label,
  })

  // The only "neutral" outcome is the idle board-label state — that's exactly
  // when the indicator should be the board picker. Every other outcome is a
  // transient status (Running / Compiling / error / upload) shown as text, and
  // the board can't change mid-run anyway.
  const isIdle = info.tone === "neutral"

  // Container chrome (border, bg, rounded corners) is owned by the right-edge
  // wrapper in bottom-toolbar.tsx so Status + BoardStatus read as one surface.
  // This component provides the dot + tone color, then either the board picker
  // (idle) or the transient status label.
  return (
    <div
      className={cn(
        "flex w-40 items-center gap-2 pr-2 text-[11px] tabular-nums",
        TONE_TEXT[info.tone],
      )}
      role="status"
      aria-live="polite"
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[info.tone])} />
      {isIdle ? (
        <BoardSelector />
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span className="truncate" />}>{info.label}</TooltipTrigger>
          <TooltipContent>{info.detail ?? `${boardInfo.label} • ${boardInfo.mcu}`}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

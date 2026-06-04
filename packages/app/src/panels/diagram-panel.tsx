// ── Diagram Panel ─────────────────────────────────────────────────────────
//
// A live-synced view of the current board as a DreamerDiagram (DSL v1) JSON.
// Pair with the sketch editor: sketch is your code, diagram is your wiring +
// components as a portable, editable text document.
//
// Features:
//   • Live sync — textarea mirrors the current board whenever it changes,
//     unless the user has unsaved edits (dirty flag).
//   • Edit in place — type in the textarea to modify components, wires,
//     sketch, or environment. Apply validates + replaces the board.
//   • Paste — paste a DSL JSON from elsewhere, hit Apply.
//   • Copy / Download — export the current diagram to the clipboard or as
//     a .json file.
//   • Reset — discard pending edits, resync from the live board.
//   • Inline structured errors with JSON-paths and fuzzy suggestions.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Copy, Download, Check, RotateCw, Upload, ShieldCheck, Link2, Sparkles } from "lucide-react"
import {
  boardStateToDiagram,
  buildExternalEditPrompt,
  encodeDiagramForUrl,
  validateDiagram,
  type DiagramIssue,
} from "@dreamer/schemas"
import { useBoard } from "@/store/board-context"
import { simulationRef } from "@/simulator/simulation-ref"
import { resetAllCapVoltages } from "@/simulator/capacitor-state"
import { toast } from "@/components/ui/toast"
import { cn } from "@/utils/classnames"

type PanelStatus =
  | { kind: "idle" }
  | { kind: "applied"; at: number }
  | { kind: "validated"; at: number; issues: DiagramIssue[] }
  | { kind: "json-error"; message: string }
  | { kind: "issues"; issues: DiagramIssue[] }

function formatDiagram(state: ReturnType<typeof useBoard>["state"]): string {
  return JSON.stringify(boardStateToDiagram(state), null, 2)
}

/**
 * Strip a surrounding Markdown code fence if present. External chats often
 * wrap a returned diagram in ```json … ``` despite being asked not to; peel it
 * so the round-trip (Copy AI prompt → edit in chat → paste back → Apply) works
 * without manual cleanup. No-op when the text isn't fenced.
 */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith("```")) return raw
  return trimmed.replace(/^```[^\n]*\n/, "").replace(/\n?```\s*$/, "")
}

export function DiagramPanel() {
  const { state: boardState, send } = useBoard()
  const [text, setText] = useState(() => formatDiagram(boardState))
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<PanelStatus>({ kind: "idle" })
  const [copied, setCopied] = useState(false)
  const [copiedAi, setCopiedAi] = useState(false)
  const [shared, setShared] = useState(false)

  // Live-sync from the board whenever it changes — unless the user has
  // unsaved edits. Store a stable serialization as the diff anchor so we
  // don't clobber the textarea on no-op board updates.
  const lastSyncedBoardJsonRef = useRef<string>(text)
  useEffect(() => {
    if (dirty) return
    const next = formatDiagram(boardState)
    if (next !== lastSyncedBoardJsonRef.current) {
      lastSyncedBoardJsonRef.current = next
      setText(next)
      setStatus({ kind: "idle" })
    }
  }, [boardState, dirty])

  const handleTextChange = useCallback((value: string) => {
    setText(value)
    setDirty(true)
    setStatus({ kind: "idle" })
  }, [])

  /** Run validateDiagram on the current textarea; return the validation
   *  (or null when JSON fails to parse, with `kind:"json-error"` status set). */
  const parseAndValidate = useCallback(() => {
    let parsed: unknown
    try {
      parsed = JSON.parse(stripCodeFence(text))
    } catch (err) {
      setStatus({
        kind: "json-error",
        message: err instanceof Error ? err.message : "Invalid JSON",
      })
      return null
    }
    return validateDiagram(parsed)
  }, [text])

  const handleValidate = useCallback(() => {
    const result = parseAndValidate()
    if (!result) return
    setStatus({ kind: "validated", at: Date.now(), issues: result.issues })
  }, [parseAndValidate])

  const handleApply = useCallback(() => {
    const result = parseAndValidate()
    if (!result) return

    // Block apply on any structural error. Semantic warnings don't block —
    // they surface as a non-blocking issues panel after apply.
    const hasStructuralError = result.issues.some(
      (i) => i.category === "structural" && i.severity === "error",
    )
    if (!result.ok || hasStructuralError) {
      setStatus({ kind: "issues", issues: result.issues })
      return
    }

    // Stop simulation, reset transient state, swap the board.
    simulationRef.current?.stop()
    resetAllCapVoltages()
    send({ type: "RESET_PINS" } as never)
    send({ type: "LOAD_BOARD", state: result.boardState! } as never)

    const nextState = result.boardState!
    const componentCount = Object.keys(nextState.components).length
    const wireCount = Object.keys(nextState.wires).length
    toast.success(
      `Diagram applied — ${componentCount} component${componentCount === 1 ? "" : "s"}, ${wireCount} wire${wireCount === 1 ? "" : "s"}.`,
      {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () => send({ type: "UNDO" } as never),
        },
      },
    )

    setDirty(false)
    // Keep semantic warnings visible after apply so the user still sees them.
    if (result.issues.length > 0) {
      setStatus({ kind: "validated", at: Date.now(), issues: result.issues })
    } else {
      setStatus({ kind: "applied", at: Date.now() })
    }
  }, [parseAndValidate, send])

  const handleResetToBoard = useCallback(() => {
    const next = formatDiagram(boardState)
    lastSyncedBoardJsonRef.current = next
    setText(next)
    setDirty(false)
    setStatus({ kind: "idle" })
  }, [boardState])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable — fall back to selection
      const ta = document.getElementById("diagram-panel-textarea") as HTMLTextAreaElement | null
      ta?.select()
    }
  }, [text])

  const handleCopyForAi = useCallback(async () => {
    // Bundle the current buffer with an auto-generated format spec so the user
    // can paste it into any external chat (no API key / MCP needed) and get a
    // valid edited diagram back to Apply here.
    const prompt = buildExternalEditPrompt(text)
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedAi(true)
      setTimeout(() => setCopiedAi(false), 1500)
      toast.success("AI edit prompt copied — paste it into any chat (ChatGPT, Claude, …), then paste the result back here.")
    } catch {
      toast.error("Could not copy to clipboard — select the textarea and copy manually.")
    }
  }, [text])

  const handleShareLink = useCallback(async () => {
    // Encode the live board — not the textarea buffer — so a share link
    // always reflects what the user sees on the canvas. A user can still
    // copy-and-paste the JSON for unsaved edits; share links are for the
    // applied circuit.
    const encoded = encodeDiagramForUrl(boardStateToDiagram(boardState))
    const url = new URL(window.location.href)
    // Drop hash + any existing diagram param so we produce a clean link.
    url.hash = ""
    url.searchParams.delete("diagram")
    url.searchParams.delete("learn")
    url.searchParams.set("diagram", encoded)
    const shareUrl = url.toString()
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShared(true)
      setTimeout(() => setShared(false), 1500)
      toast.success("Share link copied to clipboard.")
    } catch {
      toast.error("Could not copy to clipboard — select the address bar and copy manually.")
    }
  }, [boardState])

  const handleDownload = useCallback(() => {
    const blob = new Blob([text], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "breadbox-diagram.json"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [text])

  const appliedAgo = useMemo(() => {
    if (status.kind !== "applied") return null
    const diff = Date.now() - status.at
    if (diff < 2_000) return "applied"
    return null
  }, [status])

  const issueCounts = useMemo(() => {
    const issues =
      status.kind === "issues"
        ? status.issues
        : status.kind === "validated"
          ? status.issues
          : []
    return {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
    }
  }, [status])

  return (
    <div className="flex h-full w-full flex-col bg-[#1a1a1a] text-xs text-zinc-200">
      {/* Toolbar */}
      <header className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-neutral-700 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
          Diagram
        </span>

        {/* Status pill */}
        {dirty ? (
          <span className="rounded-full bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-300">
            unsaved edits
          </span>
        ) : status.kind === "issues" || status.kind === "validated" ? (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px]",
              issueCounts.errors > 0
                ? "bg-red-900/40 text-red-300"
                : issueCounts.warnings > 0
                  ? "bg-amber-900/40 text-amber-300"
                  : "bg-emerald-900/40 text-emerald-300",
            )}
          >
            {issueCounts.errors > 0
              ? `${issueCounts.errors} error${issueCounts.errors === 1 ? "" : "s"}`
              : issueCounts.warnings > 0
                ? `${issueCounts.warnings} warning${issueCounts.warnings === 1 ? "" : "s"}`
                : "✓ all checks passed"}
          </span>
        ) : appliedAgo ? (
          <span className="rounded-full bg-emerald-900/40 px-1.5 py-0.5 text-[10px] text-emerald-300">
            ✓ applied
          </span>
        ) : (
          <span className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500">
            synced with board
          </span>
        )}

        {/* Actions — pushed right on wide panels; wrap to their own row(s)
            instead of clipping the (critical) Validate/Apply when narrow. */}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <IconButton
            label="Copy as JSON"
            onClick={handleCopy}
            icon={copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          />
          <IconButton
            label="Copy AI edit prompt (diagram + spec for any chat)"
            onClick={handleCopyForAi}
            icon={copiedAi ? <Check className="size-3" /> : <Sparkles className="size-3" />}
          />
          <IconButton
            label="Download as .json"
            onClick={handleDownload}
            icon={<Download className="size-3" />}
          />
          <IconButton
            label="Copy shareable link"
            onClick={handleShareLink}
            icon={shared ? <Check className="size-3" /> : <Link2 className="size-3" />}
          />
          <IconButton
            label="Reset to current board"
            onClick={handleResetToBoard}
            icon={<RotateCw className="size-3" />}
            disabled={!dirty}
          />

          <button
            type="button"
            onClick={handleValidate}
            disabled={!text.trim()}
            className="ml-1 flex items-center gap-1 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-[11px] font-medium text-neutral-200 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-transparent disabled:text-zinc-500"
          >
            <ShieldCheck className="size-3" />
            Validate
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-zinc-500"
            disabled={!text.trim()}
          >
            <Upload className="size-3" />
            Apply
          </button>
        </div>
      </header>

      {/* Textarea */}
      <div className="flex min-h-0 flex-1 flex-col">
        <textarea
          id="diagram-panel-textarea"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none border-0 bg-neutral-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600 focus:ring-0"
          placeholder="Paste a DreamerDiagram JSON here, or edit the live board state above."
        />

        {/* JSON parse ribbon */}
        {status.kind === "json-error" && (
          <div className="shrink-0 border-t border-red-700/60 bg-red-900/20 px-3 py-2 text-[11px] text-red-300">
            <span className="font-semibold">JSON parse error:</span> {status.message}
          </div>
        )}

        {/* Issues list — validation result, grouped by severity */}
        {(status.kind === "issues" || status.kind === "validated") &&
          status.issues.length > 0 && (
            <div className="max-h-56 shrink-0 overflow-y-auto border-t border-neutral-700 bg-neutral-950/60 px-3 py-2 text-[11px]">
              <IssueGroup
                label="Errors"
                issues={status.issues.filter((i) => i.severity === "error")}
                tone="error"
              />
              <IssueGroup
                label="Warnings"
                issues={status.issues.filter((i) => i.severity === "warning")}
                tone="warning"
              />
            </div>
          )}

        {/* Validated-clean confirmation */}
        {status.kind === "validated" && status.issues.length === 0 && (
          <div className="shrink-0 border-t border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-[11px] text-emerald-300">
            <span className="font-semibold">✓ All checks passed.</span> Safe to apply.
          </div>
        )}
      </div>
    </div>
  )
}

function IssueGroup({
  label,
  issues,
  tone,
}: {
  label: string
  issues: DiagramIssue[]
  tone: "error" | "warning"
}) {
  if (issues.length === 0) return null
  const toneColor =
    tone === "error"
      ? "text-red-300 border-red-700/60 bg-red-950/30"
      : "text-amber-300 border-amber-700/60 bg-amber-950/30"
  const codeColor = tone === "error" ? "bg-red-950/50 text-red-200" : "bg-amber-950/50 text-amber-200"

  return (
    <section className={cn("mb-2 rounded border px-2 py-1 last:mb-0", toneColor)}>
      <header className="mb-1 flex items-baseline justify-between">
        <span className="font-semibold">{label}</span>
        <span className="text-[10px] opacity-70">{issues.length}</span>
      </header>
      <ul className="space-y-1">
        {issues.map((issue, i) => (
          <li key={i} className="flex gap-2">
            <code className={cn("shrink-0 rounded px-1 font-mono text-[10px]", codeColor)}>
              {issue.code}
            </code>
            {issue.path && (
              <code className="shrink-0 text-[10px] opacity-70">{issue.path}</code>
            )}
            <span className="text-[11px] leading-snug">
              {issue.message}
              {issue.suggestion && (
                <span className="opacity-70">
                  {" "}— {issue.suggestion}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex items-center gap-1 rounded p-1 text-neutral-400 transition-colors",
        "hover:bg-neutral-800 hover:text-neutral-200",
        "disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent",
      )}
    >
      {icon}
    </button>
  )
}

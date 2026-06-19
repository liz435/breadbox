// ── Diagram Panel ─────────────────────────────────────────────────────────
//
// Two ways to edit the board as a DreamerDiagram (DSL v1):
//
//   • AI edit (default) — a guided round-trip with any external chat, no
//     Anthropic API key / MCP / Claude Code needed. The user types the change
//     they want; we bake it into a prompt (diagram + auto-generated spec) for
//     them to copy into ChatGPT/Claude, then they paste the reply back and
//     Apply. The raw DSL is never shown — it rides along inside the prompt.
//     This flow lives in @/ai/diagram-edit (useAiEdit + AiEditView) so the AI
//     Hub modal can embed the exact same experience.
//
//   • Raw JSON (toggle) — the live-synced DSL document for power users:
//     edit/paste JSON directly, Copy / Download / Share, Validate, Apply.
//
// Both paths share the same validate → apply pipeline (structural errors block;
// semantic warnings surface but don't), and both tolerate a surrounding
// ```json code fence on paste since chats love to add one.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Copy, Download, Check, RotateCw, Upload, ShieldCheck, Link2, Sparkles, Braces } from "lucide-react"
import { boardStateToDiagram, encodeDiagramForUrl } from "@dreamer/schemas"
import { useBoard } from "@/store/board-context"
import { toast } from "@/components/ui/toast"
import { cn } from "@/utils/classnames"
import {
  AiEditView,
  StatusFooter,
  copyFixRequest,
  formatDiagram,
  useAiEdit,
  useDiagramApply,
  type PanelStatus,
} from "@/ai/diagram-edit"

type PanelMode = "ai" | "raw"

export function DiagramPanel() {
  const { state: boardState } = useBoard()
  const [mode, setMode] = useState<PanelMode>("ai")

  // Shared validate → apply pipeline (raw mode); AI mode gets its own copy via
  // useAiEdit below — both bind to the same board, so it's one behaviour.
  const { runValidate, applyDiagram } = useDiagramApply()

  // Raw-JSON mode state.
  const [text, setText] = useState(() => formatDiagram(boardState))
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<PanelStatus>({ kind: "idle" })
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)

  // AI-edit mode state + handlers (shared with the AI Hub modal).
  const ai = useAiEdit()

  // Live-sync the raw buffer from the board whenever it changes — unless the
  // user has unsaved raw edits. Store a stable serialization as the diff anchor
  // so we don't clobber the textarea on no-op board updates.
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

  // ── Raw-JSON mode handlers ───────────────────────────────────────────────

  const handleTextChange = useCallback((value: string) => {
    setText(value)
    setDirty(true)
    setStatus({ kind: "idle" })
  }, [])

  const handleValidateRaw = useCallback(() => {
    const result = runValidate(text, setStatus)
    if (result) setStatus({ kind: "validated", at: Date.now(), issues: result.issues })
  }, [runValidate, text])

  const handleApplyRaw = useCallback(() => {
    if (applyDiagram(text, setStatus)) setDirty(false)
  }, [applyDiagram, text])

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
      const ta = document.getElementById("diagram-panel-textarea") as HTMLTextAreaElement | null
      ta?.select()
    }
  }, [text])

  const handleShareLink = useCallback(async () => {
    // Encode the live board — not the textarea buffer — so a share link always
    // reflects what's on the canvas.
    const encoded = encodeDiagramForUrl(boardStateToDiagram(boardState))
    const url = new URL(window.location.href)
    url.hash = ""
    url.searchParams.delete("diagram")
    url.searchParams.delete("learn")
    url.searchParams.set("diagram", encoded)
    try {
      await navigator.clipboard.writeText(url.toString())
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

  // ── Derived (active-mode) status for the toolbar pill ────────────────────

  const activeStatus = mode === "raw" ? status : ai.status
  const activeDirty = mode === "raw" ? dirty : false

  const appliedAgo = useMemo(() => {
    if (activeStatus.kind !== "applied") return null
    return Date.now() - activeStatus.at < 2_000 ? "applied" : null
  }, [activeStatus])

  const issueCounts = useMemo(() => {
    const issues =
      activeStatus.kind === "issues" || activeStatus.kind === "validated" ? activeStatus.issues : []
    return {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
    }
  }, [activeStatus])

  return (
    <div className="flex h-full w-full flex-col bg-background text-xs text-foreground">
      {/* Toolbar */}
      <header className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Diagram
        </span>

        {/* Status pill — reflects the active mode */}
        {activeDirty ? (
          <span className="rounded-full bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-300">
            unsaved edits
          </span>
        ) : activeStatus.kind === "issues" || activeStatus.kind === "validated" ? (
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
        ) : mode === "raw" ? (
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
            synced with board
          </span>
        ) : null}

        {/* Actions — pushed right; wrap to their own row(s) instead of clipping
            when the panel is narrow. Raw-mode actions only show in raw mode. */}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {mode === "raw" && (
            <>
              <IconButton
                label="Copy as JSON"
                onClick={handleCopy}
                icon={copied ? <Check className="size-3" /> : <Copy className="size-3" />}
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
                onClick={handleValidateRaw}
                disabled={!text.trim()}
                className="ml-1 flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-muted-foreground"
              >
                <ShieldCheck className="size-3" />
                Validate
              </button>
              <button
                type="button"
                onClick={handleApplyRaw}
                disabled={!text.trim()}
                className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                <Upload className="size-3" />
                Apply
              </button>
            </>
          )}

          {/* Mode toggle — always available */}
          <button
            type="button"
            onClick={() => setMode((m) => (m === "ai" ? "raw" : "ai"))}
            title={mode === "ai" ? "Show the raw DSL JSON" : "Back to AI edit"}
            className="ml-1 flex items-center gap-1 rounded border border-border bg-secondary/60 px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            {mode === "ai" ? (
              <>
                <Braces className="size-3" />
                Raw JSON
              </>
            ) : (
              <>
                <Sparkles className="size-3" />
                AI edit
              </>
            )}
          </button>
        </div>
      </header>

      {mode === "ai" ? (
        <AiEditView ai={ai} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <textarea
            id="diagram-panel-textarea"
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            spellCheck={false}
            aria-label="DreamerDiagram JSON"
            className="min-h-0 flex-1 resize-none border-0 bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:ring-0"
            placeholder="Paste a DreamerDiagram JSON here, or edit the live board state."
          />
          <StatusFooter status={status} bleed onCopyFix={(issues) => copyFixRequest(text, issues)} />
        </div>
      )}
    </div>
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
        "flex items-center gap-1 rounded p-1 text-muted-foreground transition-colors",
        "hover:bg-secondary hover:text-foreground",
        "disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent",
      )}
    >
      {icon}
    </button>
  )
}

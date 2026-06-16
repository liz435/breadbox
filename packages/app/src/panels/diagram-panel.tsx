// ── Diagram Panel ─────────────────────────────────────────────────────────
//
// Two ways to edit the board as a DreamerDiagram (DSL v1):
//
//   • AI edit (default) — a guided round-trip with any external chat, no
//     Anthropic API key / MCP / Claude Code needed. The user types the change
//     they want; we bake it into a prompt (diagram + auto-generated spec) for
//     them to copy into ChatGPT/Claude, then they paste the reply back and
//     Apply. The raw DSL is never shown — it rides along inside the prompt.
//
//   • Raw JSON (toggle) — the live-synced DSL document for power users:
//     edit/paste JSON directly, Copy / Download / Share, Validate, Apply.
//
// Both paths share the same validate → apply pipeline (structural errors block;
// semantic warnings surface but don't), and both tolerate a surrounding
// ```json code fence on paste since chats love to add one.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Copy, Download, Check, RotateCw, Upload, ShieldCheck, Link2, Sparkles, Braces } from "lucide-react"
import {
  autoPlaceDiagram,
  boardStateToDiagram,
  buildExternalEditPrompt,
  buildFixRequestPrompt,
  encodeDiagramForUrl,
  validateDiagram,
  type DiagramIssue,
  type DiagramValidation,
} from "@dreamer/schemas"
import { useBoard } from "@/store/board-context"
import { simulationRef } from "@/simulator/simulation-ref"
import { resetAllCapVoltages } from "@/simulator/capacitor-state"
import { toast } from "@/components/ui/toast"
import { cn } from "@/utils/classnames"

type PanelMode = "ai" | "raw"

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
 * so the round-trip works without manual cleanup. No-op when not fenced.
 */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith("```")) return raw
  return trimmed.replace(/^```[^\n]*\n/, "").replace(/\n?```\s*$/, "")
}

export function DiagramPanel() {
  const { state: boardState, send } = useBoard()
  const [mode, setMode] = useState<PanelMode>("ai")

  // Raw-JSON mode state.
  const [text, setText] = useState(() => formatDiagram(boardState))
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<PanelStatus>({ kind: "idle" })
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)

  // AI-edit mode state.
  const [changeText, setChangeText] = useState("")
  const [replyText, setReplyText] = useState("")
  const [aiStatus, setAiStatus] = useState<PanelStatus>({ kind: "idle" })
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  // Re-place pasted components onto clean rows on apply (safe because the prompt
  // mandates explicit wires; undoable). Opt-out for hand-tuned layouts.
  const [autoArrange, setAutoArrange] = useState(true)

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

  // ── Shared validate → apply pipeline ─────────────────────────────────────

  /** Parse `source` (fence-tolerant) into a JSON value. On failure, set the
   *  given status to `json-error`, toast, and return null. */
  const parseDiagramSource = useCallback(
    (source: string, set: (s: PanelStatus) => void): { value: unknown } | null => {
      try {
        return { value: JSON.parse(stripCodeFence(source)) }
      } catch (err) {
        // Common slip: pasting the *prompt* (Markdown, starts with "#") into the
        // reply box instead of the chat's JSON answer. Detect and explain it.
        const looksLikePrompt = stripCodeFence(source).trim().startsWith("#")
        const message = looksLikePrompt
          ? "That's the prompt, not the reply. Paste the prompt into a chat (ChatGPT, Claude, …), send it, then paste the JSON it answers with here."
          : err instanceof Error
            ? err.message
            : "Invalid JSON"
        set({ kind: "json-error", message })
        toast.error(
          looksLikePrompt
            ? "That's the prompt — paste the chat's JSON reply here instead."
            : `Couldn't read that as JSON — ${message}. Paste only the JSON the chat returned.`,
        )
        return null
      }
    },
    [],
  )

  /** Parse + validate `source`. Returns null on a parse failure. */
  const runValidate = useCallback(
    (source: string, set: (s: PanelStatus) => void): DiagramValidation | null => {
      const parsed = parseDiagramSource(source, set)
      if (!parsed) return null
      return validateDiagram(parsed.value)
    },
    [parseDiagramSource],
  )

  /** Validate then swap the board. Structural errors block (and surface in the
   *  status); semantic warnings don't. When `autoArrange` is set, components are
   *  re-placed onto clean rows before validation. Returns true when applied. */
  const applyDiagram = useCallback(
    (source: string, set: (s: PanelStatus) => void, autoArrange = false): boolean => {
      const parsed = parseDiagramSource(source, set)
      if (!parsed) return false
      const input = autoArrange ? autoPlaceDiagram(parsed.value) : parsed.value
      const result = validateDiagram(input)

      const hasStructuralError = result.issues.some(
        (i) => i.category === "structural" && i.severity === "error",
      )
      if (!result.ok || hasStructuralError || !result.boardState) {
        set({ kind: "issues", issues: result.issues })
        const errorCount = result.issues.filter((i) => i.severity === "error").length
        toast.error(
          errorCount > 0
            ? `Can't apply — ${errorCount} error${errorCount === 1 ? "" : "s"} in the diagram. See details below.`
            : "Can't apply — the diagram didn't validate. See details below.",
        )
        return false
      }

      const nextState = result.boardState
      simulationRef.current?.stop()
      resetAllCapVoltages()
      send({ type: "RESET_PINS" } as never)
      send({ type: "LOAD_BOARD", state: nextState } as never)

      const componentCount = Object.keys(nextState.components).length
      const wireCount = Object.keys(nextState.wires).length
      toast.success(
        `Diagram applied — ${componentCount} component${componentCount === 1 ? "" : "s"}, ${wireCount} wire${wireCount === 1 ? "" : "s"}.`,
        { duration: 8000, action: { label: "Undo", onClick: () => send({ type: "UNDO" } as never) } },
      )

      // Keep semantic warnings visible after apply so the user still sees them.
      if (result.issues.length > 0) set({ kind: "validated", at: Date.now(), issues: result.issues })
      else set({ kind: "applied", at: Date.now() })
      return true
    },
    [parseDiagramSource, send],
  )

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

  // ── AI-edit mode handlers ────────────────────────────────────────────────

  const handleCopyPrompt = useCallback(async () => {
    // Build from the live board so the prompt reflects the canvas, and bake the
    // user's requested change into the prompt so it's ready to send as-is.
    const prompt = buildExternalEditPrompt(formatDiagram(boardState), { change: changeText })
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedPrompt(true)
      setTimeout(() => setCopiedPrompt(false), 1500)
      toast.success("Prompt copied — paste it into ChatGPT, Claude, … and send, then paste the reply below.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }, [boardState, changeText])

  const handleValidateReply = useCallback(() => {
    const result = runValidate(replyText, setAiStatus)
    if (result) setAiStatus({ kind: "validated", at: Date.now(), issues: result.issues })
  }, [runValidate, replyText])

  const handleApplyReply = useCallback(() => {
    applyDiagram(replyText, setAiStatus, autoArrange)
  }, [applyDiagram, replyText, autoArrange])

  // Bundle the rejected diagram + its validator issues into a follow-up prompt
  // the user pastes back into the same chat — the manual validate→fix loop.
  const copyFixRequest = useCallback(async (source: string, issues: DiagramIssue[]) => {
    const prompt = buildFixRequestPrompt(stripCodeFence(source).trim(), issues)
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success("Fix request copied — paste it back into the same chat to get a corrected diagram.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }, [])

  // ── Derived (active-mode) status for the toolbar pill ────────────────────

  const activeStatus = mode === "raw" ? status : aiStatus
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
        <AiEditView
          changeText={changeText}
          onChangeChange={setChangeText}
          onCopyPrompt={handleCopyPrompt}
          copiedPrompt={copiedPrompt}
          replyText={replyText}
          onChangeReply={setReplyText}
          onValidate={handleValidateReply}
          onApply={handleApplyReply}
          onCopyFix={(issues) => copyFixRequest(replyText, issues)}
          autoArrange={autoArrange}
          onToggleAutoArrange={setAutoArrange}
          status={aiStatus}
        />
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

function AiEditView({
  changeText,
  onChangeChange,
  onCopyPrompt,
  copiedPrompt,
  replyText,
  onChangeReply,
  onValidate,
  onApply,
  onCopyFix,
  autoArrange,
  onToggleAutoArrange,
  status,
}: {
  changeText: string
  onChangeChange: (value: string) => void
  onCopyPrompt: () => void
  copiedPrompt: boolean
  replyText: string
  onChangeReply: (value: string) => void
  onValidate: () => void
  onApply: () => void
  onCopyFix: (issues: DiagramIssue[]) => void
  autoArrange: boolean
  onToggleAutoArrange: (value: boolean) => void
  status: PanelStatus
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      {/* Step 1 — describe the change */}
      <section className="flex shrink-0 flex-col gap-1.5">
        <h3 className="text-[11px] font-semibold text-foreground">1 · Describe your change</h3>
        <textarea
          value={changeText}
          onChange={(e) => onChangeChange(e.target.value)}
          rows={3}
          aria-label="Describe the change you want"
          placeholder={'e.g. "add a push button on pin 2 that toggles an LED on pin 13"'}
          className="resize-none rounded border border-border bg-background p-2 text-[12px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-border"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCopyPrompt}
            disabled={!changeText.trim()}
            className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {copiedPrompt ? <Check className="size-3" /> : <Sparkles className="size-3" />}
            {copiedPrompt ? "Copied!" : "Copy AI prompt"}
          </button>
          <span className="text-[10px] text-muted-foreground">
            then paste it into ChatGPT, Claude, … and send.
          </span>
        </div>
      </section>

      {/* Step 2 — paste the reply. The textarea is bounded + resizable (not
          flex-1) so the buttons and result footer below always stay visible. */}
      <section className="flex shrink-0 flex-col gap-1.5">
        <h3 className="text-[11px] font-semibold text-foreground">2 · Paste the AI&apos;s reply</h3>
        <textarea
          value={replyText}
          onChange={(e) => onChangeReply(e.target.value)}
          spellCheck={false}
          aria-label="Paste the AI's reply"
          placeholder="Paste the JSON the chat gave you here — a ```json code fence is fine."
          className="min-h-[10rem] resize-y rounded border border-border bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-border"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onValidate}
            disabled={!replyText.trim()}
            className="flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-muted-foreground"
          >
            <ShieldCheck className="size-3" />
            Validate
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!replyText.trim()}
            className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            <Upload className="size-3" />
            Apply
          </button>
          <label
            className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground select-none"
            title="Re-arrange components onto clean, non-overlapping rows when applying (undoable). Turn off to keep the pasted coordinates."
          >
            <input
              type="checkbox"
              checked={autoArrange}
              onChange={(e) => onToggleAutoArrange(e.target.checked)}
              className="size-3 accent-blue-600"
            />
            Auto-arrange parts
          </label>
        </div>
        <StatusFooter status={status} onCopyFix={onCopyFix} />
      </section>
    </div>
  )
}

function StatusFooter({
  status,
  bleed = false,
  onCopyFix,
}: {
  status: PanelStatus
  bleed?: boolean
  onCopyFix?: (issues: DiagramIssue[]) => void
}) {
  const base = bleed
    ? "shrink-0 border-t px-3 py-2 text-[11px]"
    : "rounded border px-3 py-2 text-[11px]"

  if (status.kind === "json-error") {
    return (
      <div className={cn(base, "border-red-700/60 bg-red-900/20 text-red-300")}>
        <span className="font-semibold">JSON parse error:</span> {status.message}
      </div>
    )
  }

  if ((status.kind === "issues" || status.kind === "validated") && status.issues.length > 0) {
    const hasErrors = status.issues.some((i) => i.severity === "error")
    return (
      <div className={cn(base, "max-h-56 overflow-y-auto border-border bg-background/60")}>
        {onCopyFix && (
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {hasErrors
                ? "Won't apply until these are fixed."
                : "Applied — these are warnings."}
            </span>
            <button
              type="button"
              onClick={() => onCopyFix(status.issues)}
              title="Copy a follow-up prompt that lists these issues for the chat to fix"
              className="flex items-center gap-1 rounded border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Sparkles className="size-3" />
              Copy fix request
            </button>
          </div>
        )}
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
    )
  }

  if (status.kind === "validated" && status.issues.length === 0) {
    return (
      <div className={cn(base, "border-emerald-700/60 bg-emerald-900/20 text-emerald-300")}>
        <span className="font-semibold">✓ All checks passed.</span> Safe to apply.
      </div>
    )
  }

  return null
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
        "flex items-center gap-1 rounded p-1 text-muted-foreground transition-colors",
        "hover:bg-secondary hover:text-foreground",
        "disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent",
      )}
    >
      {icon}
    </button>
  )
}

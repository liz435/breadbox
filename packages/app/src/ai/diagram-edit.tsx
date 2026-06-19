// ── Shared diagram AI-edit logic + view ──────────────────────────────────
//
// The "AI edit" round-trip — describe a change, copy a baked prompt for any
// external chat (ChatGPT / Claude / …), paste the reply, validate, apply — and
// the validate → apply pipeline it shares with the raw-JSON editor. Extracted
// from diagram-panel.tsx so the AI Hub modal can embed the exact same flow:
// one source of truth for the pipeline and the AiEditView UI.

import { useCallback, useState } from "react"
import { Check, ShieldCheck, Upload, Sparkles } from "lucide-react"
import {
  autoPlaceDiagram,
  boardStateToDiagram,
  buildExternalEditPrompt,
  buildFixRequestPrompt,
  validateDiagram,
  type DiagramIssue,
  type DiagramValidation,
} from "@dreamer/schemas"
import { useBoard } from "@/store/board-context"
import { simulationRef } from "@/simulator/simulation-ref"
import { resetAllCapVoltages } from "@/simulator/capacitor-state"
import { toast } from "@/components/ui/toast"
import { cn } from "@/utils/classnames"

export type PanelStatus =
  | { kind: "idle" }
  | { kind: "applied"; at: number }
  | { kind: "validated"; at: number; issues: DiagramIssue[] }
  | { kind: "json-error"; message: string }
  | { kind: "issues"; issues: DiagramIssue[] }

export function formatDiagram(state: ReturnType<typeof useBoard>["state"]): string {
  return JSON.stringify(boardStateToDiagram(state), null, 2)
}

/**
 * Strip a surrounding Markdown code fence if present. External chats often
 * wrap a returned diagram in ```json … ``` despite being asked not to; peel it
 * so the round-trip works without manual cleanup. No-op when not fenced.
 */
export function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith("```")) return raw
  return trimmed.replace(/^```[^\n]*\n/, "").replace(/\n?```\s*$/, "")
}

/**
 * Bundle a rejected diagram + its validator issues into a follow-up prompt the
 * user pastes back into the same chat — the manual validate → fix loop.
 */
export async function copyFixRequest(source: string, issues: DiagramIssue[]): Promise<void> {
  const prompt = buildFixRequestPrompt(stripCodeFence(source).trim(), issues)
  try {
    await navigator.clipboard.writeText(prompt)
    toast.success("Fix request copied — paste it back into the same chat to get a corrected diagram.")
  } catch {
    toast.error("Could not copy to clipboard.")
  }
}

// ── Shared validate → apply pipeline ───────────────────────────────────────

export function useDiagramApply() {
  const { send } = useBoard()

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

  return { parseDiagramSource, runValidate, applyDiagram }
}

// ── AI-edit state + handlers ───────────────────────────────────────────────

export type AiEdit = ReturnType<typeof useAiEdit>

export function useAiEdit() {
  const { state: boardState } = useBoard()
  const { runValidate, applyDiagram } = useDiagramApply()

  const [changeText, setChangeText] = useState("")
  const [replyText, setReplyText] = useState("")
  const [status, setStatus] = useState<PanelStatus>({ kind: "idle" })
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  // Re-place pasted components onto clean rows on apply (safe because the prompt
  // mandates explicit wires; undoable). Opt-out for hand-tuned layouts.
  const [autoArrange, setAutoArrange] = useState(true)

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

  const handleValidate = useCallback(() => {
    const result = runValidate(replyText, setStatus)
    if (result) setStatus({ kind: "validated", at: Date.now(), issues: result.issues })
  }, [runValidate, replyText])

  const handleApply = useCallback(() => {
    applyDiagram(replyText, setStatus, autoArrange)
  }, [applyDiagram, replyText, autoArrange])

  const handleCopyFix = useCallback(
    (issues: DiagramIssue[]) => copyFixRequest(replyText, issues),
    [replyText],
  )

  return {
    changeText,
    setChangeText,
    replyText,
    setReplyText,
    status,
    copiedPrompt,
    autoArrange,
    setAutoArrange,
    handleCopyPrompt,
    handleValidate,
    handleApply,
    handleCopyFix,
  }
}

// ── AI-edit view (shared by the Diagram panel + the AI Hub modal) ──────────

export function AiEditView({ ai }: { ai: AiEdit }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      {/* Step 1 — describe the change */}
      <section className="flex shrink-0 flex-col gap-1.5">
        <h3 className="text-[11px] font-semibold text-foreground">1 · Describe your change</h3>
        <textarea
          value={ai.changeText}
          onChange={(e) => ai.setChangeText(e.target.value)}
          rows={3}
          aria-label="Describe the change you want"
          placeholder={'e.g. "add a push button on pin 2 that toggles an LED on pin 13"'}
          className="resize-none rounded border border-border bg-background p-2 text-[12px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-border"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={ai.handleCopyPrompt}
            disabled={!ai.changeText.trim()}
            className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {ai.copiedPrompt ? <Check className="size-3" /> : <Sparkles className="size-3" />}
            {ai.copiedPrompt ? "Copied!" : "Copy AI prompt"}
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
          value={ai.replyText}
          onChange={(e) => ai.setReplyText(e.target.value)}
          spellCheck={false}
          aria-label="Paste the AI's reply"
          placeholder="Paste the JSON the chat gave you here — a ```json code fence is fine."
          className="min-h-[10rem] resize-y rounded border border-border bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-border"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={ai.handleValidate}
            disabled={!ai.replyText.trim()}
            className="flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-muted-foreground"
          >
            <ShieldCheck className="size-3" />
            Validate
          </button>
          <button
            type="button"
            onClick={ai.handleApply}
            disabled={!ai.replyText.trim()}
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
              checked={ai.autoArrange}
              onChange={(e) => ai.setAutoArrange(e.target.checked)}
              className="size-3 accent-blue-600"
            />
            Auto-arrange parts
          </label>
        </div>
        <StatusFooter status={ai.status} onCopyFix={ai.handleCopyFix} />
      </section>
    </div>
  )
}

export function StatusFooter({
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

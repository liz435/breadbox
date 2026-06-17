// ── Custom Part Editor ──────────────────────────────────────────────────────
//
// Inline authoring surface, rendered inside the component panel (project-panel).
// Edits a part in either format: a declarative DSL (JSON — portable, MCP/chat
// friendly) or a host-SDK code module (.ts — full power). Save validates,
// persists, and registers it live.
//
// The AI workflow mirrors the Diagram panel: "Prompt" copies a self-contained
// Markdown prompt (the part + the format spec) to paste into any chat; the chat
// replies with updated JSON, which "Paste" loads back (code fences stripped, and
// it warns if you paste the prompt by mistake).

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, ClipboardPaste, Copy, Save, Sparkles, Trash2 } from "lucide-react"
import { buildCustomPartPrompt } from "@dreamer/schemas"
import { Button } from "@/components/ui/button"
import { CodeEditor } from "@/components/ui/code-editor"
import { cn } from "@/utils/classnames"
import {
  CUSTOM_PART_DSL_TEMPLATE,
  CUSTOM_PART_TEMPLATE,
} from "@/components/catalog/custom-part-template"
import {
  detectFormat,
  extractPartId,
  fetchCustomPart,
  removeCustomPart,
  saveAndReload,
  type CustomPartFormat,
} from "@/components/catalog/custom-parts-api"
import type { CustomPartEditTarget } from "@/components/catalog/custom-parts-editor-store"

type Status = { kind: "idle" | "saving" | "error" | "saved"; message?: string }

/** Strip a surrounding ```json … ``` fence a chat may have added around its reply. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/)
  return fenced ? fenced[1]! : trimmed
}

export function CustomPartEditor({
  target,
  onClose,
}: {
  target: CustomPartEditTarget | null
  onClose: () => void
}) {
  const [source, setSource] = useState("")
  const [format, setFormat] = useState<CustomPartFormat>("dsl")
  // The id of a saved part (enables Delete); null for an unsaved new part.
  const [partId, setPartId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  // The DSL/code editor is collapsed by default so a part's source doesn't
  // dominate the panel; the Source header toggles it open.
  const [sourceOpen, setSourceOpen] = useState(false)

  // Load source whenever the requested target changes.
  useEffect(() => {
    if (!target) return
    setSourceOpen(false)
    if (target.kind === "new") {
      setSource(target.format === "dsl" ? CUSTOM_PART_DSL_TEMPLATE : CUSTOM_PART_TEMPLATE)
      setFormat(target.format)
      setPartId(null)
      setStatus({ kind: "idle" })
      return
    }
    const id = target.id
    void fetchCustomPart(id).then((part) => {
      if (part) {
        setSource(part.source)
        setFormat(part.format)
        setPartId(id)
        setStatus({ kind: "idle" })
      }
    })
  }, [target])

  const save = useCallback(async () => {
    const fmt = detectFormat(source)
    const id = extractPartId(source)
    if (!id) {
      setStatus({ kind: "error", message: 'Source must declare type: "custom:<name>"' })
      return
    }
    setStatus({ kind: "saving" })
    const res = await saveAndReload(id, fmt, source)
    if (res.ok) {
      setFormat(fmt)
      setPartId(id)
      setStatus({ kind: "saved", message: `Saved & loaded "${id}"` })
    } else {
      setStatus({ kind: "error", message: res.error })
    }
  }, [source])

  const remove = useCallback(async () => {
    if (!partId) return
    await removeCustomPart(partId)
    onClose()
  }, [partId, onClose])

  const copyPrompt = useCallback(() => {
    void navigator.clipboard.writeText(buildCustomPartPrompt(source)).then(
      () => setStatus({ kind: "saved", message: "Copied AI prompt — paste it into a chat" }),
      () => setStatus({ kind: "error", message: "Copy failed" }),
    )
  }, [source])

  const copyRaw = useCallback(() => {
    void navigator.clipboard.writeText(source).then(
      () => setStatus({ kind: "saved", message: "Copied source" }),
      () => setStatus({ kind: "error", message: "Copy failed" }),
    )
  }, [source])

  const paste = useCallback(() => {
    void navigator.clipboard.readText().then(
      (text) => {
        if (!text) return
        const cleaned = stripCodeFence(text)
        if (cleaned.startsWith("#")) {
          setStatus({
            kind: "error",
            message: "That's the prompt — paste the chat's JSON reply instead.",
          })
          return
        }
        setSource(cleaned)
        setFormat(detectFormat(cleaned))
        setStatus({ kind: "idle" })
      },
      () => setStatus({ kind: "error", message: "Paste failed" }),
    )
  }, [])

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Row 1: navigation + save */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button size="sm" variant="ghost" onClick={onClose} title="Back to components">
          <ChevronLeft className="mr-1 size-3.5" /> Components
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => void save()}
          disabled={status.kind === "saving"}
        >
          <Save className="mr-1.5 size-3.5" /> Save
        </Button>
      </div>

      {/* Row 2: AI prompt + clipboard */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={copyPrompt}
          title="Copy an AI prompt to edit this part in any chat"
        >
          <Sparkles className="mr-1.5 size-3.5" /> Prompt
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 px-0"
          onClick={copyRaw}
          title="Copy source"
        >
          <Copy className="size-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 px-0"
          onClick={paste}
          title="Paste source or a chat's JSON reply"
        >
          <ClipboardPaste className="size-3.5" />
        </Button>
        {partId && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-8 w-8 px-0"
            onClick={() => void remove()}
            title="Delete part"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {status.message && (
        <div
          className={cn(
            "shrink-0 truncate border-b border-border px-2 py-1 text-xs",
            status.kind === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {status.message}
        </div>
      )}

      {/* Source — collapsed by default so the DSL/code doesn't dominate the panel */}
      <button
        type="button"
        onClick={() => setSourceOpen((open) => !open)}
        aria-expanded={sourceOpen}
        className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            sourceOpen && "rotate-90",
          )}
        />
        <span className="text-xs font-medium text-foreground">Source</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
          {format}
        </span>
        {!sourceOpen && (
          <span className="ml-auto truncate text-[10px] text-muted-foreground">
            {partId ? `editing ${partId}` : "click to edit"}
          </span>
        )}
      </button>

      {sourceOpen && (
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <CodeEditor value={source} onChange={setSource} foldOnMount />
        </div>
      )}
    </div>
  )
}

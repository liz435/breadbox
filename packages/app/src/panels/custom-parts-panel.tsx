// ── Custom Part Editor ──────────────────────────────────────────────────────
//
// Inline authoring surface, rendered inside the component panel (project-panel).
// Edits a part in either format: a declarative DSL (JSON — portable, copy-paste
// / MCP friendly) or a host-SDK code module (.ts — full power). Save validates,
// persists, and registers it live; Copy/Paste round-trip the source to a
// chatbot. Opened from the palette's Custom group; Back returns to the palette.

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ClipboardPaste, Copy, Save, Trash2 } from "lucide-react"
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

  // Load source whenever the requested target changes.
  useEffect(() => {
    if (!target) return
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

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(source).then(
      () => setStatus({ kind: "saved", message: "Copied to clipboard" }),
      () => setStatus({ kind: "error", message: "Copy failed" }),
    )
  }, [source])

  const paste = useCallback(() => {
    void navigator.clipboard.readText().then(
      (text) => {
        if (!text) return
        setSource(text)
        setFormat(detectFormat(text))
        setStatus({ kind: "idle" })
      },
      () => setStatus({ kind: "error", message: "Paste failed" }),
    )
  }, [])

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Button size="sm" variant="ghost" onClick={onClose} title="Back to components">
          <ChevronLeft className="mr-0.5 size-3.5" /> Components
        </Button>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
          {format}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={copy} title="Copy source">
            <Copy className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={paste} title="Paste source">
            <ClipboardPaste className="size-3.5" />
          </Button>
          {partId && (
            <Button size="sm" variant="ghost" onClick={() => void remove()} title="Delete part">
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <Button size="sm" onClick={() => void save()} disabled={status.kind === "saving"}>
            <Save className="mr-1 size-3.5" /> Save
          </Button>
        </div>
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

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <CodeEditor value={source} onChange={setSource} />
      </div>
    </div>
  )
}

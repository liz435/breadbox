// ── Custom Part Editor ──────────────────────────────────────────────────────
//
// Inline authoring surface, rendered inside the component panel (project-panel)
// — not a separate tab. Write a part module against the host SDK, Save & Load,
// and it's registered live: appears in the palette and simulates immediately.
// The id (after `custom:` in the source) is the filename. Opened from the
// palette's Custom group (New / Edit); Back returns to the palette.

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CodeEditor } from "@/components/ui/code-editor"
import { cn } from "@/utils/classnames"
import { CUSTOM_PART_TEMPLATE } from "@/components/catalog/custom-part-template"
import {
  extractPartId,
  fetchCustomPartSource,
  removeCustomPart,
  saveAndReload,
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
  // The id of a saved part (enables Delete); null for an unsaved new part.
  const [partId, setPartId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  // Load source whenever the requested target changes.
  useEffect(() => {
    if (!target) return
    if (target.kind === "new") {
      setSource(CUSTOM_PART_TEMPLATE)
      setPartId(null)
      setStatus({ kind: "idle" })
      return
    }
    const id = target.id
    void fetchCustomPartSource(id).then((src) => {
      if (src != null) {
        setSource(src)
        setPartId(id)
        setStatus({ kind: "idle" })
      }
    })
  }, [target])

  const save = useCallback(async () => {
    const id = extractPartId(source)
    if (!id) {
      setStatus({ kind: "error", message: 'Source must declare type: "custom:<name>"' })
      return
    }
    setStatus({ kind: "saving" })
    const res = await saveAndReload(id, source)
    if (res.ok) {
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

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Button size="sm" variant="ghost" onClick={onClose} title="Back to components">
          <ChevronLeft className="mr-0.5 size-3.5" /> Components
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {partId && (
            <Button size="sm" variant="ghost" onClick={() => void remove()} title="Delete part">
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <Button size="sm" onClick={() => void save()} disabled={status.kind === "saving"}>
            <Save className="mr-1 size-3.5" /> Save &amp; Load
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

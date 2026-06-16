// ── Custom Parts Panel ──────────────────────────────────────────────────────
//
// In-app authoring surface for custom components. Write a part module against
// the host SDK, Save & Load it, and it's registered live — appears in the
// component palette and simulates immediately. Parts are stored by the sidecar
// under the data home; the id (after `custom:` in the source) is the filename.

import { useCallback, useEffect, useState } from "react"
import { Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CodeEditor } from "@/components/ui/code-editor"
import { cn } from "@/utils/classnames"
import { CUSTOM_PART_TEMPLATE } from "@/components/catalog/custom-part-template"
import {
  extractPartId,
  fetchCustomPartSource,
  listCustomParts,
  removeCustomPart,
  saveAndReload,
} from "@/components/catalog/custom-parts-api"
import {
  subscribeCustomPartEditor,
  takeCustomPartTarget,
  type CustomPartEditTarget,
} from "@/components/catalog/custom-parts-editor-store"

type Status = { kind: "idle" | "saving" | "error" | "saved"; message?: string }

export function CustomPartsPanel() {
  const [parts, setParts] = useState<string[]>([])
  const [source, setSource] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  const refresh = useCallback(async () => {
    const list = await listCustomParts()
    setParts(list.map((p) => p.id))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openPart = useCallback(async (id: string) => {
    const src = await fetchCustomPartSource(id)
    if (src != null) {
      setSource(src)
      setSelectedId(id)
      setStatus({ kind: "idle" })
    }
  }, [])

  const newPart = useCallback(() => {
    setSource(CUSTOM_PART_TEMPLATE)
    setSelectedId(null)
    setStatus({ kind: "idle" })
  }, [])

  const save = useCallback(async () => {
    const id = extractPartId(source)
    if (!id) {
      setStatus({ kind: "error", message: 'Source must declare type: "custom:<name>"' })
      return
    }
    setStatus({ kind: "saving" })
    const res = await saveAndReload(id, source)
    if (res.ok) {
      setSelectedId(id)
      setStatus({ kind: "saved", message: `Saved & loaded "${id}"` })
      void refresh()
    } else {
      setStatus({ kind: "error", message: res.error })
    }
  }, [source, refresh])

  const remove = useCallback(async () => {
    if (!selectedId) return
    await removeCustomPart(selectedId)
    setSelectedId(null)
    setSource("")
    setStatus({ kind: "idle" })
    void refresh()
  }, [selectedId, refresh])

  // React to "new part" / "edit this part" requests from the palette.
  const applyTarget = useCallback(
    (target: CustomPartEditTarget) => {
      if (target.kind === "new") newPart()
      else void openPart(target.id)
    },
    [newPart, openPart],
  )

  useEffect(() => {
    const initial = takeCustomPartTarget()
    if (initial) applyTarget(initial)
    return subscribeCustomPartEditor(applyTarget)
  }, [applyTarget])

  return (
    <div className="flex h-full bg-card">
      {/* Parts list */}
      <div className="flex w-44 flex-shrink-0 flex-col border-r border-border">
        <div className="border-b border-border p-2">
          <Button size="sm" variant="outline" onClick={newPart} className="w-full">
            <Plus className="mr-1 size-3.5" /> New Part
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {parts.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">No custom parts yet.</p>
          )}
          {parts.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => void openPart(id)}
              className={cn(
                "w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent",
                selectedId === id && "bg-accent",
              )}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
          <Button size="sm" onClick={() => void save()} disabled={status.kind === "saving"}>
            <Save className="mr-1 size-3.5" /> Save &amp; Load
          </Button>
          {selectedId && (
            <Button size="sm" variant="ghost" onClick={() => void remove()}>
              <Trash2 className="mr-1 size-3.5" /> Delete
            </Button>
          )}
          <span
            className={cn(
              "ml-auto truncate text-xs",
              status.kind === "error" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {status.message}
          </span>
        </div>
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {source ? (
            <CodeEditor value={source} onChange={setSource} />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
              Select a part on the left, or create a New Part.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Asset library ───────────────────────────────────────────────────────────
//
// A collapsible section of the scene manager listing the project's uploaded
// model files. It lets the user reuse one asset across several bodies (add
// another instance without re-uploading) and reclaim orphaned files (models no
// body references). Referenced files show "in use" and can't be deleted here —
// deletion is only offered for orphans, and it's a hard delete (safe, since
// nothing points at it and it isn't an undoable edit).

import { useEffect, useState } from "react"
import { Boxes, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"
import type { AssemblyBody } from "@dreamer/schemas"
import { toast } from "@/components/ui/toast"
import { cn } from "@/utils/classnames"
import { useProject } from "@/project/project-context"
import { deleteProjectAsset } from "@/project/api-client"
import { defaultUnitScale } from "./model-import"
import { uniqueBodyId } from "./assembly-edits"
import { useAssemblyActions, useAssemblyDoc } from "./use-assembly"
import { useEditor } from "./editor-state"
import { useProjectAssets, type ModelAsset } from "./use-project-assets"

function formatBytes(bytes: number | null): string {
  if (bytes === null) return ""
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

export function AssetLibrary() {
  const { projectId } = useProject()
  const { assets, loading, refetch } = useProjectAssets(projectId)
  const assembly = useAssemblyDoc()
  const { addBody } = useAssemblyActions()
  const { select } = useEditor()
  const [open, setOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const bodies = Object.values(assembly.bodies)
  const usedIds = new Set(bodies.map((body) => body.assetId))
  // Re-list when the referenced-asset set changes — a just-imported model
  // shows up, and a deleted body's file flips to "orphaned".
  const usedKey = [...usedIds].sort().join(",")
  useEffect(() => {
    refetch()
  }, [usedKey, refetch])

  // Nothing to manage until at least one model has been uploaded.
  if (assets.length === 0 && !loading) return null

  function addToScene(asset: ModelAsset) {
    // Inherit sizing from an existing body on the same asset, so a reused
    // model comes in already calibrated rather than at raw file units.
    const sibling = bodies.find((body) => body.assetId === asset.id)
    const id = uniqueBodyId(assembly.bodies, `body_${asset.id.slice(0, 8)}`)
    const body: AssemblyBody = {
      id,
      name: asset.name,
      assetId: asset.id,
      uri: asset.uri,
      format: asset.format,
      node: sibling?.node,
      parent: { kind: "world" },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
      importScale: sibling?.importScale ?? defaultUnitScale(asset.format),
      upAxis: sibling?.upAxis ?? (asset.format === "stl" ? "z" : "y"),
    }
    addBody(body)
    select(id)
  }

  async function deleteAsset(asset: ModelAsset) {
    setPendingDelete(null)
    try {
      await deleteProjectAsset(projectId, asset.id)
      refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete model")
    }
  }

  return (
    <div className="mt-2 border-t border-border pt-2">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <Boxes className="h-3.5 w-3.5" />
        Asset library
        <span className="font-normal text-muted-foreground/70">({assets.length})</span>
      </button>

      {open && (
        <ul className="mt-1.5 space-y-1">
          {assets.map((asset) => {
            const used = usedIds.has(asset.id)
            const confirming = pendingDelete === asset.id
            return (
              <li
                key={asset.id}
                className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs" title={asset.name}>
                    {asset.name}
                  </span>
                  <span className="rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">
                    {asset.format}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span
                    className={cn(
                      "rounded px-1",
                      used
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "bg-amber-500/15 text-amber-600",
                    )}
                  >
                    {used ? "in use" : "orphaned"}
                  </span>
                  {asset.sizeBytes !== null && <span>{formatBytes(asset.sizeBytes)}</span>}
                  <span className="flex-1" />
                  {confirming ? (
                    <>
                      <button
                        type="button"
                        className="font-medium text-red-500 hover:underline"
                        onClick={() => void deleteAsset(asset)}
                      >
                        Delete file
                      </button>
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => setPendingDelete(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 hover:text-foreground"
                        onClick={() => addToScene(asset)}
                        title="Add another instance of this model to the scene"
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </button>
                      {!used && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-red-500"
                          onClick={() => setPendingDelete(asset.id)}
                          title="Delete this unused model file"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

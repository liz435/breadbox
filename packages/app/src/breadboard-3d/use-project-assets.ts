// ── Project model-asset library ─────────────────────────────────────────────
//
// Reads the uploaded 3D-model assets registered on the project (the files
// behind assembly bodies) so the scene manager can list them, reuse one across
// several bodies, and clean up orphans. Wraps the existing `listProjectAssets`
// client fn; the underlying files + records already exist on the server.

import { useCallback, useEffect, useState } from "react"
import type { ModelFormat } from "@dreamer/schemas"
import { listProjectAssets } from "@/project/api-client"

export type ModelAsset = {
  id: string
  uri: string
  name: string
  format: ModelFormat
  /** File size in bytes, when the server recorded it. */
  sizeBytes: number | null
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key]
  return typeof value === "string" ? value : null
}

function toModelAsset(asset: {
  id: string
  uri: string
  meta: Record<string, unknown>
}): ModelAsset {
  const ext = (metaString(asset.meta, "ext") ?? asset.uri.split(".").pop() ?? "").toLowerCase()
  const size = asset.meta.size
  return {
    id: asset.id,
    uri: asset.uri,
    name: metaString(asset.meta, "name") ?? metaString(asset.meta, "originalName") ?? asset.id,
    format: ext === "stl" ? "stl" : "glb",
    sizeBytes: typeof size === "number" ? size : null,
  }
}

/**
 * The project's uploaded model assets, refetchable after an import or delete.
 * Fetching lives in this dedicated hook (not ad-hoc in a component); a
 * `cancelled` guard drops a late response after unmount or a project switch.
 */
export function useProjectAssets(projectId: string): {
  assets: ModelAsset[]
  loading: boolean
  refetch: () => void
} {
  const [assets, setAssets] = useState<ModelAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listProjectAssets(projectId)
      .then((all) => {
        if (cancelled) return
        setAssets(all.filter((asset) => asset.type === "model").map(toModelAsset))
      })
      .catch(() => {
        if (!cancelled) setAssets([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, nonce])

  return { assets, loading, refetch }
}

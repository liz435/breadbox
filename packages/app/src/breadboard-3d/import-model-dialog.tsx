// ── Import 3D model dialog ──────────────────────────────────────────────────
//
// Shown after the user picks a GLB/STL file. Parses it locally to show real
// bounding-box dimensions, lets the user fix units (STL is unitless; GLB is
// meters by spec) and the up axis, then uploads the file as a project asset
// and adds an assembly body referencing it.

import { useCallback, useEffect, useRef, useState } from "react"
import { Dialog } from "@base-ui/react/dialog"
import type { AssemblyBody, ModelFormat } from "@dreamer/schemas"
import { uploadProjectAsset } from "@/project/api-client"
import { useProject } from "@/project/project-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAssemblyActions } from "./use-assembly"
import {
  analyzeModelFile,
  defaultUnitScale,
  detectModelFormat,
  UNIT_PRESETS,
  type ModelAnalysis,
} from "./model-import"

const MAX_MODEL_BYTES = 50 * 1024 * 1024

function formatMm(value: number): string {
  return value >= 100 ? `${Math.round(value)}` : value.toFixed(1)
}

export function ImportModelDialog({ file, onClose }: { file: File; onClose: () => void }) {
  const { projectId } = useProject()
  const { addBody } = useAssemblyActions()

  const format = detectModelFormat(file.name)
  const [analysis, setAnalysis] = useState<ModelAnalysis | null>(null)
  const [error, setError] = useState<string | null>(
    format === null
      ? "Unsupported file type — upload a .glb or .stl file."
      : file.size > MAX_MODEL_BYTES
        ? "File is larger than 50 MB."
        : null,
  )
  const [name, setName] = useState(file.name.replace(/\.[^.]+$/, ""))
  const [unitScale, setUnitScale] = useState(() => (format ? defaultUnitScale(format) : 1))
  // Hobby STLs come from z-up CAD almost universally; glTF is y-up by spec.
  const [upAxis, setUpAxis] = useState<"y" | "z">(format === "stl" ? "z" : "y")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!format || file.size > MAX_MODEL_BYTES) return
    let cancelled = false
    file
      .arrayBuffer()
      .then((buffer) => analyzeModelFile(buffer, format))
      .then((result) => {
        if (!cancelled) setAnalysis(result)
      })
      .catch(() => {
        if (!cancelled) setError("Could not parse this file — is it a valid model?")
      })
    return () => {
      cancelled = true
    }
  }, [file, format])

  // Cancelling (Escape, backdrop, Cancel) must abort an in-flight upload.
  // Without this the request runs to completion after the dialog is gone, and
  // its continuation drops a body into the scene the user thought they'd
  // cancelled — along with an asset on the server.
  const uploadRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    uploadRef.current?.abort()
    onClose()
  }, [onClose])

  useEffect(() => () => uploadRef.current?.abort(), [])

  async function importModel(fmt: ModelFormat) {
    setSaving(true)
    setError(null)
    const controller = new AbortController()
    uploadRef.current = controller
    try {
      const uploaded = await uploadProjectAsset(projectId, file, {
        signal: controller.signal,
      })
      // The dialog may have closed while the upload was in flight.
      if (controller.signal.aborted) return
      const body: AssemblyBody = {
        id: `body_${uploaded.assetId.slice(0, 8)}`,
        name: name.trim() || file.name,
        assetId: uploaded.assetId,
        uri: uploaded.uri,
        format: fmt,
        parent: { kind: "world" },
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
        importScale: unitScale,
        upAxis,
      }
      addBody(body)
      onClose()
    } catch (err) {
      // An abort is a user action, not a failure — the dialog is already gone.
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : "Upload failed")
      setSaving(false)
    } finally {
      if (uploadRef.current === controller) uploadRef.current = null
    }
  }

  const dims = analysis
    ? {
        x: analysis.size.x * unitScale,
        y: analysis.size.y * unitScale,
        z: analysis.size.z * unitScale,
      }
    : null

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) cancel()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-4 shadow-2xl">
          <Dialog.Title className="text-sm font-semibold text-foreground">
            Import 3D model
          </Dialog.Title>
          <div className="mt-3 space-y-3 text-sm">
            <div className="text-xs text-muted-foreground">{file.name}</div>

            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">File units</span>
              <select
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                value={unitScale}
                onChange={(e) => setUnitScale(Number(e.target.value))}
              >
                {UNIT_PRESETS.map((preset) => (
                  <option key={preset.label} value={preset.scale}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            {format === "stl" && (
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Up axis</span>
                <select
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  value={upAxis}
                  onChange={(e) => {
                    setUpAxis(e.target.value === "z" ? "z" : "y")
                  }}
                >
                  <option value="z">Z up (most CAD exports)</option>
                  <option value="y">Y up</option>
                </select>
              </label>
            )}

            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              {dims ? (
                <>
                  Size:{" "}
                  <span className="font-medium text-foreground">
                    {formatMm(dims.x)} × {formatMm(dims.y)} × {formatMm(dims.z)} mm
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    — a breadboard is ~55 mm wide. If this looks wrong, change the units.
                  </span>
                </>
              ) : error ? (
                <span className="text-red-500">{error}</span>
              ) : (
                "Measuring model…"
              )}
            </div>

            {error && dims && <div className="text-xs text-red-500">{error}</div>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (format) void importModel(format)
                }}
                disabled={!format || !analysis || saving}
              >
                {saving ? "Uploading…" : "Import"}
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

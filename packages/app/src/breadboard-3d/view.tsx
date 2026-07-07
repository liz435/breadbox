// ── 3D Breadboard view (lazy chunk entry) ───────────────────────────────────
//
// Everything three.js-flavored lives behind this module so the main bundle
// stays clean: the Canvas scene, the import dialog (which parses model files
// with three's loaders), the assembly panel, and the gizmo-mode toolbar.

import { useRef, useState } from "react"
import { toast } from "@/components/ui/toast"
import { cn } from "@/utils/classnames"
import { Button } from "@/components/ui/button"
import { SceneRoot } from "./scene-root"
import { ImportModelDialog } from "./import-model-dialog"
import { AssemblyPanel } from "./assembly-panel"
import { downloadSceneGlb } from "./scene-export"
import { EditorProvider, useEditor, type GizmoMode } from "./editor-state"

const GIZMO_MODES: { mode: GizmoMode; label: string }[] = [
  { mode: "translate", label: "Move" },
  { mode: "rotate", label: "Rotate" },
  { mode: "scale", label: "Scale" },
]

function GizmoModeToolbar() {
  const { selectedBodyId, mode, setMode } = useEditor()
  if (!selectedBodyId) return null
  return (
    <div className="pointer-events-auto absolute left-1/2 top-2 flex -translate-x-1/2 gap-0.5 rounded-lg border border-border bg-background/95 p-0.5 shadow-lg backdrop-blur">
      {GIZMO_MODES.map((entry) => (
        <button
          key={entry.mode}
          type="button"
          className={cn(
            "rounded px-2 py-1 text-xs hover:bg-muted",
            mode === entry.mode && "bg-muted font-medium",
          )}
          onClick={() => setMode(entry.mode)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}

export function Breadboard3dView() {
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [exporting, setExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setExporting(true)
    try {
      const { savedTo, cancelled } = await downloadSceneGlb("breadboard-assembly.glb")
      if (!cancelled) {
        toast.success(
          savedTo ? `Saved to ${savedTo}` : "Exported breadboard-assembly.glb to your downloads",
        )
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? `Export failed: ${error.message}` : "Export failed",
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <EditorProvider>
      <div className="relative h-full w-full">
        <SceneRoot />

        <AssemblyPanel />
        <GizmoModeToolbar />

        <div className="absolute right-2 top-2 flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExport}
            disabled={exporting}
            title="Download the whole assembly as a .glb (e.g. to check fit in a slicer)"
          >
            {exporting ? "Exporting…" : "Export .glb"}
          </Button>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            title="Upload a .glb or .stl model (e.g. a part you're about to 3D-print)"
          >
            Import 3D model
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,.stl"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) setPendingFile(file)
              e.target.value = ""
            }}
          />
        </div>

        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/40 px-2 py-0.5 text-[11px] text-white/80">
          drag to orbit · right-drag to pan · scroll to zoom · click a model to place it
        </div>

        {pendingFile && (
          <ImportModelDialog file={pendingFile} onClose={() => setPendingFile(null)} />
        )}
      </div>
    </EditorProvider>
  )
}

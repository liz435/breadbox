// ── 3D Breadboard view (lazy chunk entry) ───────────────────────────────────
//
// Everything three.js-flavored lives behind this module so the main bundle
// stays clean: the Canvas scene and the import dialog (which parses model
// files with three's loaders). Scene management (the assembly panel) lives in
// the Components sidebar's 3D panel, wired through shared stores.

import { useRef, useState } from "react"
import { toast } from "@/components/ui/toast"
import { SceneRoot } from "./scene-root"
import { ImportModelDialog } from "./import-model-dialog"
import { setPendingModelFile, usePendingModelFile } from "./pending-model-import"
import { usePhysicsEnabled } from "./physics-flag"
import {
  useBreadboardCalibrating,
} from "./breadboard-calibration"
import { BreadboardGridCalibrationPanel } from "./breadboard-grid-calibration-panel"
import {
  usePinCalibrationMode,
} from "./component-pin-calibration"
import { ComponentPinCalibrationPanel } from "./component-pin-calibration-panel"
import {
  useCalibrating as useArduinoCalibrating,
} from "./arduino-calibration"
import { CalibrationPanel } from "./calibration-panel"

const MODEL_DROP_RE = /\.(glb|gltf|stl)$/i

export function Breadboard3dView() {
  // Shared store (not local state) so the Components sidebar's 3D actions
  // panel can also start an import; this view owns the dialog.
  const pendingFile = usePendingModelFile()
  const [dragActive, setDragActive] = useState(false)
  // Counts drag enter/leave across nested children so the drop overlay doesn't
  // flicker as the cursor crosses the Canvas and its siblings.
  const dragDepth = useRef(0)
  const physicsEnabled = usePhysicsEnabled()
  const calibrating = useBreadboardCalibrating()
  const pinMode = usePinCalibrationMode()
  const arduinoCalibrating = useArduinoCalibrating()

  function handleDropFile(file: File | undefined) {
    if (!file) return
    if (!MODEL_DROP_RE.test(file.name)) {
      toast.error("Unsupported file — drop a .glb, .gltf, or .stl model")
      return
    }
    setPendingModelFile(file)
  }

  return (
    <div
      className="relative h-full w-full"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        dragDepth.current += 1
        setDragActive(true)
      }}
      onDragOver={(e) => {
        // Only claim file drags; leave in-canvas orbit/gizmo drags alone.
        if (e.dataTransfer.types.includes("Files")) e.preventDefault()
      }}
      onDragLeave={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        dragDepth.current -= 1
        if (dragDepth.current <= 0) {
          dragDepth.current = 0
          setDragActive(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragDepth.current = 0
        setDragActive(false)
        handleDropFile(e.dataTransfer.files?.[0])
      }}
    >
      <SceneRoot />

      {calibrating && <BreadboardGridCalibrationPanel />}
      {pinMode.on && <ComponentPinCalibrationPanel />}
      {arduinoCalibrating && <CalibrationPanel />}

      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/40 px-2 py-0.5 text-[11px] text-white/80">
        {physicsEnabled
          ? "drag a part to move it (snaps to a hole) · drag empty space to orbit · scroll to zoom"
          : "drag to orbit · right-drag to pan · scroll to zoom · click a model to place it"}
      </div>

      {dragActive && (
        <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
          <span className="rounded-md bg-background/90 px-3 py-1.5 text-sm font-medium text-foreground shadow">
            Drop to add a 3D model
          </span>
        </div>
      )}

      {pendingFile && (
        <ImportModelDialog file={pendingFile} onClose={() => setPendingModelFile(null)} />
      )}
    </div>
  )
}

// ── 3D Breadboard view (lazy chunk entry) ───────────────────────────────────
//
// Everything three.js-flavored lives behind this module so the main bundle
// stays clean: the Canvas scene, the import dialog (which parses model files
// with three's loaders), the assembly panel, and the gizmo-mode toolbar.

import { useRef, useState } from "react"
import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { SceneRoot } from "./scene-root"
import { ImportModelDialog } from "./import-model-dialog"
import { AssemblyPanel } from "./assembly-panel"
import { downloadSceneGlb } from "./scene-export"
import { EditorProvider } from "./editor-state"
import { setPhysicsEnabled, usePhysicsEnabled } from "./physics-flag"
import {
  setBreadboardCalibrating,
  useBreadboardCalibrating,
} from "./breadboard-calibration"
import { BreadboardGridCalibrationPanel } from "./breadboard-grid-calibration-panel"
import {
  setPinCalibrating,
  usePinCalibrationMode,
} from "./component-pin-calibration"
import { ComponentPinCalibrationPanel } from "./component-pin-calibration-panel"
import {
  setCalibrating as setArduinoCalibrating,
  useCalibrating as useArduinoCalibrating,
} from "./arduino-calibration"
import { CalibrationPanel } from "./calibration-panel"
import { setObstacleDebug, useObstacleDebug } from "./obstacle-debug"
import { GLB_PARTS } from "./glb-parts"

const FIRST_GLB_TYPE = Object.keys(GLB_PARTS).sort()[0] ?? null

export function Breadboard3dView() {
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [exporting, setExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const physicsEnabled = usePhysicsEnabled()
  const calibrating = useBreadboardCalibrating()
  const pinMode = usePinCalibrationMode()
  const arduinoCalibrating = useArduinoCalibrating()
  const obstacleDebug = useObstacleDebug()

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

        <div className="absolute right-2 top-2 flex gap-2">
          <Button
            size="sm"
            variant={physicsEnabled ? "default" : "secondary"}
            onClick={() => setPhysicsEnabled(!physicsEnabled)}
            title="Toggle Rapier physics: parts drop, settle, and can be dragged; wires drape and can be grabbed to reshape — double-click a wire to reset (experimental)"
          >
            {physicsEnabled ? "Physics: On" : "Physics: Off"}
          </Button>
          <Button
            size="sm"
            variant={calibrating ? "default" : "secondary"}
            onClick={() => setBreadboardCalibrating(!calibrating)}
            title="Drag the anchor handles onto the model's holes to warp the grid + wires onto it"
          >
            {calibrating ? "Calibrating…" : "Calibrate grid"}
          </Button>
          <Button
            size="sm"
            variant={pinMode.on ? "default" : "secondary"}
            onClick={() => setPinCalibrating(!pinMode.on, pinMode.type ?? FIRST_GLB_TYPE)}
            title="Drag anchors onto a part model's pins so it's sized + seated by its pin spacing"
          >
            {pinMode.on ? "Pins…" : "Calibrate pins"}
          </Button>
          <Button
            size="sm"
            variant={arduinoCalibrating ? "default" : "secondary"}
            onClick={() => setArduinoCalibrating(!arduinoCalibrating)}
            title="Drag a handle onto each Arduino header pin to align wire attach points with the 3D model"
          >
            {arduinoCalibrating ? "Arduino…" : "Calibrate Arduino"}
          </Button>
          <Button
            size="sm"
            variant={obstacleDebug ? "default" : "secondary"}
            onClick={() => setObstacleDebug(!obstacleDebug)}
            title="Show the wire-routing hitboxes: cyan = a part's oriented bounding box (OBB), amber = disc fallback. Wires should drape over them, not through them."
          >
            {obstacleDebug ? "Hitboxes: On" : "Show hitboxes"}
          </Button>
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

        {calibrating && <BreadboardGridCalibrationPanel />}
        {pinMode.on && <ComponentPinCalibrationPanel />}
        {arduinoCalibrating && <CalibrationPanel />}

        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/40 px-2 py-0.5 text-[11px] text-white/80">
          {physicsEnabled
            ? "drag a part to move it (snaps to a hole) · drag empty space to orbit · scroll to zoom"
            : "drag to orbit · right-drag to pan · scroll to zoom · click a model to place it"}
        </div>

        {pendingFile && (
          <ImportModelDialog file={pendingFile} onClose={() => setPendingFile(null)} />
        )}
      </div>
    </EditorProvider>
  )
}

// ── Breadboard grid calibration panel (DOM overlay) ──────────────────────────
//
// Controls for the anchor warp: drag the 24 handles in the scene onto the
// model's holes; this panel sets the shared surface height, exports the result
// ("Copy JSON" → paste into a baked default), resets to the schematic grid, and
// leaves the mode. Everything reads/writes the live grid-calibration store.

import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { setBreadboardCalibrating } from "./breadboard-calibration"
import {
  getGridCalibration,
  resetGridCalibration,
  setHeight,
  useGridCalibration,
} from "./breadboard-grid-calibration"

const HEIGHT_STEP_MM = 0.5

export function BreadboardGridCalibrationPanel() {
  const cal = useGridCalibration()

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(getGridCalibration(), null, 2))
      toast.success("Grid calibration copied")
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  return (
    <div className="absolute right-2 top-12 w-60 rounded-lg border border-white/10 bg-black/70 p-3 text-white shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">
        Grid calibration
      </div>

      <p className="mb-3 text-[11px] leading-snug text-white/60">
        Drag each handle onto its model hole. Green = terminal corners
        (labelled row,col); red/blue = rail block ends (col:row). The grid fills
        in between.
      </p>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-white/70">
          <span>Surface height</span>
          <span className="tabular-nums">{cal.height.toFixed(1)} mm</span>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => setHeight(cal.height - HEIGHT_STEP_MM)}
          >
            −
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => setHeight(cal.height + HEIGHT_STEP_MM)}
          >
            +
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Button size="sm" variant="secondary" onClick={handleCopy}>
          Copy JSON
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            resetGridCalibration()
            toast.success("Grid reset to schematic")
          }}
        >
          Reset to schematic
        </Button>
        <Button size="sm" onClick={() => setBreadboardCalibrating(false)}>
          Done
        </Button>
      </div>
    </div>
  )
}

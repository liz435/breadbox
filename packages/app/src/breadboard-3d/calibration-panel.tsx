// ── Arduino pin calibration panel (DOM overlay) ──────────────────────────────
//
// The out-of-Canvas controls for the pin calibrator. While calibration mode is
// on, the scene drops a draggable handle on every Arduino header pin (see
// arduino-calibrator.tsx); this panel lets you set the shared header height,
// export the result ("Copy JSON" → paste into BAKED_CALIBRATION), reset, and
// leave the mode. Wire endpoints read the same store live, so everything you
// drag updates the jumper wires immediately.

import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import {
  clearCalibration,
  getCalibration,
  setCalibrating,
  setHeaderY,
  useCalibration,
} from "./arduino-calibration"

/** How much one height step nudges the header plane (mm). */
const HEIGHT_STEP_MM = 0.5

export function CalibrationPanel() {
  const { headerY, overrides } = useCalibration()
  const overrideCount = Object.keys(overrides).length

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(getCalibration(), null, 2))
      toast.success("Calibration copied — paste into BAKED_CALIBRATION")
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  return (
    <div className="absolute right-2 top-12 w-56 rounded-lg border border-white/10 bg-black/70 p-3 text-white shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">
        Pin calibration
      </div>

      <p className="mb-3 text-[11px] leading-snug text-white/60">
        Drag each labelled handle onto its real socket. {overrideCount} pin
        {overrideCount === 1 ? "" : "s"} moved.
      </p>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-white/70">
          <span>Header height</span>
          <span className="tabular-nums">{headerY.toFixed(1)} mm</span>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => setHeaderY(headerY - HEIGHT_STEP_MM)}
          >
            −
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => setHeaderY(headerY + HEIGHT_STEP_MM)}
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
            clearCalibration()
            toast.success("Calibration reset")
          }}
        >
          Reset
        </Button>
        <Button size="sm" onClick={() => setCalibrating(false)}>
          Done
        </Button>
      </div>
    </div>
  )
}

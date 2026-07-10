// ── Component pin calibration panel (DOM overlay) ────────────────────────────
//
// Pick a component type, then drag the pink anchors in the scene onto that
// model's pins. "Copy JSON" exports the captured per-type pin positions to paste
// into BAKED_PIN_CALIBRATION. Everything reads/writes the live pin-calibration
// store.

import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/classnames"
import { GLB_PARTS } from "./glb-parts"
import {
  clearPinCalibration,
  getPinCalibrations,
  setPinCalibrating,
  setPinCalibrationType,
  usePinCalibrationMode,
  usePinCalibrations,
} from "./component-pin-calibration"

const TYPES = Object.keys(GLB_PARTS).sort()

export function ComponentPinCalibrationPanel() {
  const mode = usePinCalibrationMode()
  const cals = usePinCalibrations()
  const type = mode.type

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(getPinCalibrations(), null, 2))
      toast.success("Pin calibration copied")
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  return (
    <div className="absolute right-2 top-12 w-60 rounded-lg border border-white/10 bg-black/70 p-3 text-white shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">
        Pin calibration
      </div>

      <p className="mb-2 text-[11px] leading-snug text-white/60">
        Pick a part, then drag each pink anchor onto the matching pin on the
        floating model. The label shows the pin's hole offset. Shift-drag moves
        the camera.
      </p>

      <div className="mb-3 max-h-40 overflow-y-auto rounded border border-white/10">
        {TYPES.map((t) => {
          const done = Array.isArray(cals[t]) && cals[t].length >= 2
          return (
            <button
              key={t}
              type="button"
              onClick={() => setPinCalibrationType(t)}
              className={cn(
                "flex w-full items-center justify-between px-2 py-1 text-left text-[11px]",
                t === type ? "bg-white text-black" : "text-white/80 hover:bg-white/10",
              )}
            >
              <span>{t}</span>
              {done && <span className={cn(t === type ? "text-black" : "text-emerald-400")}>✓</span>}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <Button size="sm" variant="secondary" onClick={handleCopy}>
          Copy JSON
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!type}
          onClick={() => {
            if (!type) return
            clearPinCalibration(type)
            toast.success(`Cleared ${type}`)
          }}
        >
          Clear this part
        </Button>
        <Button size="sm" onClick={() => setPinCalibrating(false)}>
          Done
        </Button>
      </div>
    </div>
  )
}

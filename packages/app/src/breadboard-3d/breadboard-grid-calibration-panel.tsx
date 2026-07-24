// ── Breadboard grid calibration panel (DOM overlay) ──────────────────────────
//
// Controls for the anchor warp: drag the 8 terminal corners + 4 rail width
// handles in the scene onto the model's holes, then click one to select it and
// fine-tune with the X/Z steppers or arrow keys. This panel sets the shared
// surface height, exports the result ("Copy JSON" → paste into a baked default),
// resets to the baked grid, and leaves the mode. Everything reads/writes the
// live grid store.

import { useEffect, useState } from "react"
import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/classnames"
import { resetBreadboardTransform, setBreadboardCalibrating } from "./breadboard-calibration"
import {
  anchorLabel,
  anchorXZ,
  getGridCalibration,
  nudgeAnchor,
  resetGridCalibration,
  setHeight,
  useGridCalibration,
  useSelectedAnchor,
} from "./breadboard-grid-calibration"

const HEIGHT_STEP_MM = 0.5
const NUDGE_STEPS_MM = [0.05, 0.1, 0.5] as const

function AxisRow({
  axis,
  value,
  onDec,
  onInc,
}: {
  axis: string
  value: number
  onDec: () => void
  onInc: () => void
}) {
  return (
    <div className="mb-1 flex items-center gap-1">
      <span className="w-3 text-[11px] font-medium text-white/60">{axis}</span>
      <Button size="sm" variant="secondary" className="h-6 flex-1 px-0" onClick={onDec}>
        −
      </Button>
      <span className="w-14 text-center text-[11px] tabular-nums text-white/80">
        {value.toFixed(2)}
      </span>
      <Button size="sm" variant="secondary" className="h-6 flex-1 px-0" onClick={onInc}>
        +
      </Button>
    </div>
  )
}

export function BreadboardGridCalibrationPanel() {
  const cal = useGridCalibration()
  const selected = useSelectedAnchor()
  const [step, setStep] = useState<number>(0.1)

  // Arrow keys nudge the selected anchor by one step in the ground plane — a
  // keyboard companion to the X/Z steppers, finer than dragging on the plane.
  useEffect(() => {
    if (!selected) return
    const onKey = (event: KeyboardEvent) => {
      const el = event.target
      if (el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return
      let dx = 0
      let dz = 0
      if (event.key === "ArrowLeft") dx = -step
      else if (event.key === "ArrowRight") dx = step
      else if (event.key === "ArrowUp") dz = -step
      else if (event.key === "ArrowDown") dz = step
      else return
      event.preventDefault()
      nudgeAnchor(selected, dx, dz)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected, step])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(getGridCalibration(), null, 2))
      toast.success("Grid calibration copied")
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  const pos = selected ? anchorXZ(selected) : null

  return (
    <div className="absolute right-2 top-12 w-60 rounded-lg border border-white/10 bg-black/70 p-3 text-white shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">
        Grid calibration
      </div>

      <p className="mb-3 text-[11px] leading-snug text-white/60">
        Drag each green corner onto its model hole (labelled row,col) — the
        terminal grid fills in between. Drag the red/blue rail handles sideways
        to set each power rail's width. Click an anchor to select it, then
        fine-tune with the X/Z buttons or arrow keys. Hold Shift and drag to move
        the camera.
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

      {selected && pos && (
        <div className="mb-3 rounded-md border border-white/10 bg-white/5 p-2">
          <div className="mb-1.5 text-[11px] font-medium text-white/80">
            Fine-tune · {anchorLabel(selected)}
          </div>
          <AxisRow
            axis="X"
            value={pos.x}
            onDec={() => nudgeAnchor(selected, -step, 0)}
            onInc={() => nudgeAnchor(selected, step, 0)}
          />
          <AxisRow
            axis="Z"
            value={pos.z}
            onDec={() => nudgeAnchor(selected, 0, -step)}
            onInc={() => nudgeAnchor(selected, 0, step)}
          />
          <div className="mt-1.5 flex items-center gap-1">
            <span className="text-[10px] text-white/50">Step</span>
            {NUDGE_STEPS_MM.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStep(s)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
                  step === s
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/70 hover:bg-white/20",
                )}
              >
                {s}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-white/40">mm</span>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-white/40">
            Arrow keys nudge by one step.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Button size="sm" variant="secondary" onClick={handleCopy}>
          Copy JSON
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            // The hole grid and the board's own scale/position live in two stores.
            // Reset BOTH — resetting only the grid leaves the board running off a
            // stale saved transform, so the (correct) grid ends up off the board.
            resetGridCalibration()
            resetBreadboardTransform()
            toast.success("Grid + board reset to baked")
          }}
        >
          Reset to baked
        </Button>
        <Button size="sm" onClick={() => setBreadboardCalibrating(false)}>
          Done
        </Button>
      </div>
    </div>
  )
}

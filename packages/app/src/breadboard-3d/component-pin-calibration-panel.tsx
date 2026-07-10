// ── Component pin calibration panel (DOM overlay) ────────────────────────────
//
// Pick a component type, pick a pin (or click its anchor in the scene), then
// seat it precisely with the X/Z steppers or arrow keys — no dragging needed.
// "Copy JSON" exports the captured per-type pin positions to paste into
// BAKED_PIN_CALIBRATION. Everything reads/writes the live pin-calibration store.

import { useEffect, useMemo, useState } from "react"
import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/classnames"
import { getComponentFootprint } from "@/breadboard/breadboard-grid"
import { GLB_PARTS } from "./glb-parts"
import { footprintGaps } from "./part-frame"
import {
  clearPinCalibration,
  getPinCalibrations,
  nudgePinAnchor,
  setPinCalibrating,
  setPinCalibrationType,
  setPinGaps,
  setSelectedPin,
  usePinCalibrationMode,
  usePinCalibrations,
  useSelectedPin,
} from "./component-pin-calibration"

const TYPES = Object.keys(GLB_PARTS).sort()
const NUDGE_STEPS_MM = [0.25, 1, 4] as const

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

export function ComponentPinCalibrationPanel() {
  const mode = usePinCalibrationMode()
  const cals = usePinCalibrations()
  const selected = useSelectedPin()
  const type = mode.type
  const [step, setStep] = useState<number>(1)

  const pinCount = useMemo(
    () => (type ? getComponentFootprint(type, 0, 0, 0).points.length : 0),
    [type],
  )
  const defaultGaps = useMemo(() => (type ? footprintGaps(type) : []), [type])
  const overrideGaps = type ? cals[type]?.gaps : undefined
  const gaps = overrideGaps ?? defaultGaps

  function bumpGap(i: number, delta: number) {
    if (!type) return
    const next = (overrideGaps ?? defaultGaps).slice()
    next[i] = Math.max(0, (next[i] ?? 1) + delta)
    setPinGaps(type, next)
  }

  // Arrow keys nudge the selected pin in the model's board plane.
  useEffect(() => {
    if (!type || selected == null) return
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
      nudgePinAnchor(type, selected, dx, dz)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [type, selected, step])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(getPinCalibrations(), null, 2))
      toast.success("Pin calibration copied")
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  const pos = type && selected != null ? cals[type]?.pins[selected] : undefined

  return (
    <div className="absolute right-2 top-12 max-h-[calc(100vh-4rem)] w-60 overflow-y-auto rounded-lg border border-white/10 bg-black/70 p-3 text-white shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">
        Pin calibration
      </div>

      <p className="mb-2 text-[11px] leading-snug text-white/60">
        Pick a part, pick a pin, then seat it with the X/Z buttons or arrow keys
        (or drag its pink anchor). Shift-drag moves the camera.
      </p>

      <div className="mb-3 max-h-32 overflow-y-auto rounded border border-white/10">
        {TYPES.map((t) => {
          const done = (cals[t]?.pins.length ?? 0) >= 2
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

      {type && pinCount >= 2 && (
        <div className="mb-3 rounded-md border border-white/10 bg-white/5 p-2">
          <div className="mb-1.5 text-[11px] font-medium text-white/80">Pins</div>
          <div className="mb-2 flex flex-wrap gap-1">
            {Array.from({ length: pinCount }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedPin(i)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] tabular-nums",
                  selected === i ? "bg-amber-400 text-black" : "bg-white/10 text-white/70 hover:bg-white/20",
                )}
              >
                {i}
              </button>
            ))}
          </div>

          {selected != null && (
            <>
              <AxisRow
                axis="X"
                value={pos?.x ?? 0}
                onDec={() => nudgePinAnchor(type, selected, -step, 0)}
                onInc={() => nudgePinAnchor(type, selected, step, 0)}
              />
              <AxisRow
                axis="Z"
                value={pos?.z ?? 0}
                onDec={() => nudgePinAnchor(type, selected, 0, -step)}
                onInc={() => nudgePinAnchor(type, selected, 0, step)}
              />
              <div className="mt-1.5 flex items-center gap-1">
                <span className="text-[10px] text-white/50">Step</span>
                {NUDGE_STEPS_MM.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStep(s)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] tabular-nums",
                      step === s ? "bg-white text-black" : "bg-white/10 text-white/70 hover:bg-white/20",
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
            </>
          )}
        </div>
      )}

      {type && pinCount >= 2 && (
        <div className="mb-3 rounded-md border border-white/10 bg-white/5 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-white/80">Pin gaps (holes)</span>
            <span className="text-[10px] text-white/40">{overrideGaps ? "override" : "auto"}</span>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {gaps.map((g, i) => (
              <div key={i} className="mb-1 flex items-center gap-1 pr-1">
                <span className="w-8 text-[11px] text-white/60">{i}–{i + 1}</span>
                <Button size="sm" variant="secondary" className="h-6 flex-1 px-0" onClick={() => bumpGap(i, -1)}>
                  −
                </Button>
                <span className="w-8 text-center text-[11px] tabular-nums text-white/80">{g}</span>
                <Button size="sm" variant="secondary" className="h-6 flex-1 px-0" onClick={() => bumpGap(i, 1)}>
                  +
                </Button>
              </div>
            ))}
          </div>
          {overrideGaps && type && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-1 h-6 w-full"
              onClick={() => setPinGaps(type, undefined)}
            >
              Reset to footprint
            </Button>
          )}
        </div>
      )}

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

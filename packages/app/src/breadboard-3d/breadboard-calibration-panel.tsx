// ── Breadboard calibration panel (DOM overlay) ───────────────────────────────
//
// Out-of-Canvas controls for placing the breadboard GLB under the fixed hole
// grid. Drag the model itself in the scene to move it (see BreadboardModel);
// this panel handles height, in-plane rotation and scale, then exports the
// result ("Copy JSON" → paste into DEFAULT_TRANSFORM), resets, and leaves the
// mode. Everything reads/writes the same live store, so the model updates as
// you go.

import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import {
  getBreadboardTransform,
  resetBreadboardTransform,
  setBreadboardCalibrating,
  setBreadboardTransform,
  useBreadboardTransform,
} from "./breadboard-calibration"

const HEIGHT_STEP_MM = 0.5
const SCALE_STEP = 0.02
const YAW_STEP_RAD = (5 * Math.PI) / 180 // 5°

function Row({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string
  value: string
  onDec: () => void
  onInc: () => void
}) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between text-[11px] text-white/70">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" className="flex-1" onClick={onDec}>
          −
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={onInc}>
          +
        </Button>
      </div>
    </div>
  )
}

export function BreadboardCalibrationPanel() {
  const t = useBreadboardTransform()
  const deg = ((t.yaw * 180) / Math.PI).toFixed(0)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(getBreadboardTransform(), null, 2))
      toast.success("Placement copied — paste into DEFAULT_TRANSFORM")
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  return (
    <div className="absolute right-2 top-12 w-56 rounded-lg border border-white/10 bg-black/70 p-3 text-white shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">
        Breadboard placement
      </div>

      <p className="mb-3 text-[11px] leading-snug text-white/60">
        Drag the model to move it. Offset {t.x.toFixed(1)}, {t.z.toFixed(1)} mm.
      </p>

      <Row
        label="Height"
        value={`${t.y.toFixed(1)} mm`}
        onDec={() => setBreadboardTransform({ y: t.y - HEIGHT_STEP_MM })}
        onInc={() => setBreadboardTransform({ y: t.y + HEIGHT_STEP_MM })}
      />
      <Row
        label="Rotation"
        value={`${deg}°`}
        onDec={() => setBreadboardTransform({ yaw: t.yaw - YAW_STEP_RAD })}
        onInc={() => setBreadboardTransform({ yaw: t.yaw + YAW_STEP_RAD })}
      />
      <Row
        label="Scale"
        value={t.scale.toFixed(2)}
        onDec={() => setBreadboardTransform({ scale: Math.max(0.1, t.scale - SCALE_STEP) })}
        onInc={() => setBreadboardTransform({ scale: t.scale + SCALE_STEP })}
      />

      <Button
        size="sm"
        variant="secondary"
        className="mb-3 w-full"
        onClick={() => setBreadboardTransform({ yaw: t.yaw + Math.PI / 2 })}
      >
        Rotate 90°
      </Button>

      <div className="flex flex-col gap-1.5">
        <Button size="sm" variant="secondary" onClick={handleCopy}>
          Copy JSON
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            resetBreadboardTransform()
            toast.success("Reset to default placement")
          }}
        >
          Reset to default
        </Button>
        <Button size="sm" onClick={() => setBreadboardCalibrating(false)}>
          Done
        </Button>
      </div>
    </div>
  )
}

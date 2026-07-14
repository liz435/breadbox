// ── Breadboard grid calibrator (drag anchors onto the model's holes) ─────────
//
// Renders the 12 draggable anchor handles that drive the grid warp:
//   • 8 terminal corners (4 per bank) — drag each onto the model hole at the
//     labelled (row,col).
//   • 4 rail width anchors (1 per rail col) — drag each left/right onto its rail
//     column; only the sideways position matters (it sets the rail's width).
// Click a handle to select it (highlighted yellow), then fine-tune it from the
// panel — X/Z steppers or arrow keys, finer than dragging. Dragging records the
// handle's world x/z into the store, which the 3D holes and wire endpoints read
// live. Height comes from the panel. Shift-drag reframes the camera.

import { useCallback, useMemo, useState } from "react"
import { Plane, Vector2, Vector3 } from "three"
import { Html } from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import type { ThreeEvent } from "@react-three/fiber"
import { ROWS } from "@/breadboard/breadboard-constants"
import { isPositiveRailCol } from "@/breadboard/breadboard-grid"
import {
  RAIL_COLS,
  anchorKey,
  setAnchor,
  setSelectedAnchor,
  useGridCalibration,
  useSelectedAnchor,
  type AnchorRef,
  type BankCorners,
  type XZ,
} from "./breadboard-grid-calibration"

const UP = new Vector3(0, 1, 0)
const ROW_MAX = ROWS - 1

type ToggleableControls = { enabled: boolean }
function isToggleable(controls: unknown): controls is ToggleableControls {
  return !!controls && typeof (controls as { enabled?: unknown }).enabled === "boolean"
}

function AnchorHandle({
  anchor,
  pos,
  height,
  color,
  label,
  selected,
}: {
  anchor: AnchorRef
  pos: XZ
  height: number
  color: string
  label: string
  selected: boolean
}) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const raycaster = useThree((s) => s.raycaster)
  const controls = useThree((s) => s.controls)
  const [dragging, setDragging] = useState(false)
  const plane = useMemo(() => new Plane(), [])
  const hit = useMemo(() => new Vector3(), [])
  const ndc = useMemo(() => new Vector2(), [])

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      // Shift-drag reframes the camera instead of moving the handle: leave the
      // event to CameraControls (don't stop it or disable them) so the user can
      // orbit/pan even when a handle sits under the cursor.
      if (event.nativeEvent.shiftKey) return
      event.stopPropagation()
      setSelectedAnchor(anchor)
      setDragging(true)
      if (isToggleable(controls)) controls.enabled = false
      const dom = gl.domElement
      plane.set(UP, -height)
      const move = (native: PointerEvent) => {
        const rect = dom.getBoundingClientRect()
        ndc.set(
          ((native.clientX - rect.left) / rect.width) * 2 - 1,
          -((native.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        if (raycaster.ray.intersectPlane(plane, hit)) setAnchor(anchor, { x: hit.x, z: hit.z })
      }
      const up = () => {
        setDragging(false)
        dom.removeEventListener("pointermove", move)
        if (isToggleable(controls)) controls.enabled = true
      }
      dom.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up, { once: true })
    },
    [anchor, camera, gl, raycaster, controls, plane, hit, ndc, height],
  )

  return (
    <group position={[pos.x, height, pos.z]}>
      <mesh onPointerDown={onPointerDown}>
        <sphereGeometry args={[dragging ? 1.8 : selected ? 1.5 : 1.2, 16, 16]} />
        <meshBasicMaterial color={dragging ? "#ffffff" : color} depthTest={false} />
      </mesh>
      {selected && (
        <mesh>
          <sphereGeometry args={[2.4, 16, 16]} />
          <meshBasicMaterial
            color="#fde047"
            wireframe
            transparent
            opacity={0.85}
            depthTest={false}
          />
        </mesh>
      )}
      <Html center distanceFactor={120} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div
          style={{
            transform: "translateY(-13px)",
            fontSize: 10,
            fontWeight: 600,
            lineHeight: 1,
            color: "#fff",
            background: selected ? "rgba(202,138,4,0.85)" : "rgba(0,0,0,0.6)",
            padding: "1px 3px",
            borderRadius: 3,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  )
}

export function BreadboardGridCalibrator() {
  const cal = useGridCalibration()
  const selected = useSelectedAnchor()
  const selKey = selected ? anchorKey(selected) : null

  return (
    <group name="bb-grid-calibrator">
      {(["L", "R"] as const).map((bank) => {
        const cs = bank === "L" ? 0 : 5
        const ce = bank === "L" ? 4 : 9
        const corners: { key: keyof BankCorners; row: number; col: number }[] = [
          { key: "c00", row: 0, col: cs },
          { key: "c10", row: 0, col: ce },
          { key: "c01", row: ROW_MAX, col: cs },
          { key: "c11", row: ROW_MAX, col: ce },
        ]
        return corners.map((c) => {
          const anchor: AnchorRef = { kind: "bank", bank, corner: c.key }
          return (
            <AnchorHandle
              key={`${bank}-${c.key}`}
              anchor={anchor}
              pos={cal.banks[bank][c.key]}
              height={cal.height}
              color="#22c55e"
              label={`${c.row},${c.col}`}
              selected={selKey === anchorKey(anchor)}
            />
          )
        })
      })}
      {RAIL_COLS.map((col) => {
        const isPositive = isPositiveRailCol(col)
        const anchor: AnchorRef = { kind: "rail", col }
        return (
          <AnchorHandle
            key={`rail-${col}`}
            anchor={anchor}
            pos={cal.rails[col]}
            height={cal.height}
            color={isPositive ? "#ef4444" : "#3b82f6"}
            label={isPositive ? "+ rail" : "− rail"}
            selected={selKey === anchorKey(anchor)}
          />
        )
      })}
    </group>
  )
}

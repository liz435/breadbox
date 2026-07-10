// ── Breadboard grid calibrator (drag anchors onto the model's holes) ─────────
//
// Renders the 24 draggable anchor handles that drive the grid warp:
//   • 8 terminal corners (4 per bank) — drag each onto the model hole at the
//     labelled (row,col).
//   • 16 rail anchors (4 per rail line) — the ends of each line's first two
//     5-hole blocks, labelled "col:row".
// Dragging records the handle's world x/z into the grid-calibration store, which
// the 3D holes and wire endpoints read live. Height comes from the panel.

import { useCallback, useMemo, useState } from "react"
import { Plane, Vector2, Vector3 } from "three"
import { Html } from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import type { ThreeEvent } from "@react-three/fiber"
import { ROWS } from "@/breadboard/breadboard-constants"
import {
  RAIL_COLS,
  setBankCorner,
  setRailAnchor,
  useGridCalibration,
  type BankCorners,
  type RailAnchors,
  type XZ,
} from "./breadboard-grid-calibration"

const UP = new Vector3(0, 1, 0)
const ROW_MAX = ROWS - 1

type ToggleableControls = { enabled: boolean }
function isToggleable(controls: unknown): controls is ToggleableControls {
  return !!controls && typeof (controls as { enabled?: unknown }).enabled === "boolean"
}

function AnchorHandle({
  pos,
  height,
  color,
  label,
  onDrag,
}: {
  pos: XZ
  height: number
  color: string
  label: string
  onDrag: (xz: XZ) => void
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
      event.stopPropagation()
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
        if (raycaster.ray.intersectPlane(plane, hit)) onDrag({ x: hit.x, z: hit.z })
      }
      const up = () => {
        setDragging(false)
        dom.removeEventListener("pointermove", move)
        if (isToggleable(controls)) controls.enabled = true
      }
      dom.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up, { once: true })
    },
    [camera, gl, raycaster, controls, plane, hit, ndc, height, onDrag],
  )

  return (
    <group position={[pos.x, height, pos.z]}>
      <mesh onPointerDown={onPointerDown}>
        <sphereGeometry args={[dragging ? 1.8 : 1.2, 16, 16]} />
        <meshBasicMaterial color={dragging ? "#ffffff" : color} depthTest={false} />
      </mesh>
      <Html center distanceFactor={120} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div
          style={{
            transform: "translateY(-13px)",
            fontSize: 10,
            fontWeight: 600,
            lineHeight: 1,
            color: "#fff",
            background: "rgba(0,0,0,0.6)",
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
        return corners.map((c) => (
          <AnchorHandle
            key={`${bank}-${c.key}`}
            pos={cal.banks[bank][c.key]}
            height={cal.height}
            color="#22c55e"
            label={`${c.row},${c.col}`}
            onDrag={(xz) => setBankCorner(bank, c.key, xz)}
          />
        ))
      })}
      {RAIL_COLS.map((col) => {
        const isPlus = col === -2 || col === 10
        const color = isPlus ? "#ef4444" : "#3b82f6"
        const keys: { key: keyof RailAnchors; row: number }[] = [
          { key: "a", row: 0 },
          { key: "b", row: ROW_MAX },
        ]
        return keys.map((k) => (
          <AnchorHandle
            key={`rail-${col}-${k.key}`}
            pos={cal.rails[col][k.key]}
            height={cal.height}
            color={color}
            label={`${col}:${k.row}`}
            onDrag={(xz) => setRailAnchor(col, k.key, xz)}
          />
        ))
      })}
    </group>
  )
}

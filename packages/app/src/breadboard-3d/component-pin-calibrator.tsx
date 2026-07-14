// ── Component pin calibrator (drag anchors onto a model's pins) ──────────────
//
// When pin-calibration mode is on for a component type, this floats that type's
// GLB model above the board and renders one draggable anchor per footprint pin.
// The user drags each anchor onto the matching pin/leg; the anchor's (x,z) is
// recorded in the model's normalized frame (see component-pin-calibration). The
// renderer then fits those pins onto real holes. Shift-drag reframes the camera.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plane, Vector2, Vector3 } from "three"
import { Html } from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import type { ThreeEvent } from "@react-three/fiber"
import { getComponentFootprint } from "@/breadboard/breadboard-grid"
import { GLB_PARTS, GlbNormalizedModel } from "./glb-parts"
import {
  ensurePinAnchors,
  setPinAnchor,
  setSelectedPin,
  usePinCalibrationMode,
  usePinCalibrations,
  useSelectedPin,
} from "./component-pin-calibration"
import type { P2 } from "./similarity-2d"

const UP = new Vector3(0, 1, 0)
/** Float the model this high above the board so its pins are easy to anchor. */
const LIFT_Y = 70

type ToggleableControls = { enabled: boolean }
function isToggleable(controls: unknown): controls is ToggleableControls {
  return !!controls && typeof (controls as { enabled?: unknown }).enabled === "boolean"
}

function defaultSpread(count: number): P2[] {
  return Array.from({ length: count }, (_, i) => ({ x: (i - (count - 1) / 2) * 4, z: 0 }))
}

function PinAnchor({
  pos,
  label,
  selected,
  onSelect,
  onDrag,
}: {
  pos: P2
  label: string
  selected: boolean
  onSelect: () => void
  onDrag: (xz: P2) => void
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
      if (event.nativeEvent.shiftKey) return
      event.stopPropagation()
      onSelect()
      setDragging(true)
      if (isToggleable(controls)) controls.enabled = false
      const dom = gl.domElement
      plane.set(UP, -LIFT_Y)
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
    [camera, gl, raycaster, controls, plane, hit, ndc, onDrag, onSelect],
  )

  return (
    <group position={[pos.x, LIFT_Y, pos.z]}>
      <mesh onPointerDown={onPointerDown}>
        <sphereGeometry args={[dragging ? 1.6 : selected ? 1.4 : 1.1, 16, 16]} />
        <meshBasicMaterial color={dragging ? "#ffffff" : "#f472b6"} depthTest={false} />
      </mesh>
      {selected && (
        <mesh>
          <sphereGeometry args={[2.1, 16, 16]} />
          <meshBasicMaterial color="#fde047" wireframe transparent opacity={0.85} depthTest={false} />
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

export function ComponentPinCalibrator() {
  const mode = usePinCalibrationMode()
  const cals = usePinCalibrations()
  const selected = useSelectedPin()
  const type = mode.type
  const config = type ? GLB_PARTS[type] : undefined

  // Footprint pins of a nominal placement — count + offsets for labelling.
  const pins = useMemo(() => (type ? getComponentFootprint(type, 0, 0, 0).points : []), [type])
  const count = pins.length

  useEffect(() => {
    if (mode.on && type && config && count >= 2) ensurePinAnchors(type, count)
  }, [mode.on, type, config, count])

  if (!mode.on || !type || !config || count < 2) return null

  const stored = cals[type]?.pins
  const anchors = stored && stored.length === count ? stored : defaultSpread(count)
  const base = pins[0]

  return (
    <group name="component-pin-calibrator">
      <group position={[0, LIFT_Y, 0]}>
        <GlbNormalizedModel config={config} />
      </group>
      {anchors.map((a, i) => {
        const p = pins[i]
        const dr = p.row - base.row
        const dc = p.col - base.col
        const label = `pin ${i} · r${dr >= 0 ? "+" : ""}${dr},c${dc >= 0 ? "+" : ""}${dc}`
        return (
          <PinAnchor
            key={i}
            pos={a}
            label={label}
            selected={selected === i}
            onSelect={() => setSelectedPin(i)}
            onDrag={(xz) => setPinAnchor(type, i, xz)}
          />
        )
      })}
    </group>
  )
}

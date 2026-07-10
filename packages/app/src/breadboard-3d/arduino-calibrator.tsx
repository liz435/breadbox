// ── Arduino pin calibrator (drag handles onto the GLB sockets) ───────────────
//
// When calibration mode is on, drops a labelled, draggable handle at every
// Arduino header pin. Dragging slides the handle across the header-height plane
// (camera orbit is suspended for the gesture, same trick as use-body-drag) and
// records its world x/z into the calibration store — which wire endpoints read
// live, so jumper wires snap to wherever you place the handle. The DOM controls
// (height, copy, reset) live in the 3D toolbar; see view.tsx.

import { useCallback, useMemo, useState } from "react"
import { Plane, Vector2, Vector3 } from "three"
import { Html } from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import type { ThreeEvent } from "@react-three/fiber"
import { getBoardPinLayout, type ArduinoPinInfo } from "@/breadboard/breadboard-grid"
import { useBoardSelector } from "@/store/board-context"
import { pixelToWorld } from "./layout"
import { getCalibration, setPinOverride, useCalibration } from "./arduino-calibration"

const UP = new Vector3(0, 1, 0)

/** The active camera controls expose `enabled`; flip it off during a drag so
 *  grabbing a handle doesn't also orbit the camera. */
type ToggleableControls = { enabled: boolean }
function isToggleable(controls: unknown): controls is ToggleableControls {
  return !!controls && typeof (controls as { enabled?: unknown }).enabled === "boolean"
}

const CATEGORY_COLOR: Record<string, string> = {
  digital: "#22c55e",
  analog: "#3b82f6",
  power: "#ef4444",
}

function PinHandle({ pin }: { pin: ArduinoPinInfo }) {
  const { headerY, overrides } = useCalibration()
  const fallback = useMemo(() => pixelToWorld(pin.x, pin.y), [pin.x, pin.y])
  const override = overrides[pin.pin]
  const position: [number, number, number] = [
    override?.x ?? fallback.x,
    headerY,
    override?.z ?? fallback.z,
  ]

  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const raycaster = useThree((state) => state.raycaster)
  const controls = useThree((state) => state.controls)
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

      const move = (native: PointerEvent) => {
        const rect = dom.getBoundingClientRect()
        ndc.set(
          ((native.clientX - rect.left) / rect.width) * 2 - 1,
          -((native.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        // Re-read the height each move so the header-height control applies live.
        plane.set(UP, -getCalibration().headerY)
        if (raycaster.ray.intersectPlane(plane, hit)) {
          setPinOverride(pin.pin, { x: hit.x, z: hit.z })
        }
      }
      const up = () => {
        setDragging(false)
        dom.removeEventListener("pointermove", move)
        if (isToggleable(controls)) controls.enabled = true
      }

      dom.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up, { once: true })
    },
    [camera, gl, raycaster, controls, plane, hit, ndc, pin.pin],
  )

  return (
    <group position={position}>
      <mesh onPointerDown={onPointerDown}>
        <sphereGeometry args={[dragging ? 1.7 : 1.1, 16, 16]} />
        <meshBasicMaterial
          color={dragging ? "#ffffff" : CATEGORY_COLOR[pin.category] ?? "#e5e7eb"}
          depthTest={false}
        />
      </mesh>
      <Html center distanceFactor={90} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div
          style={{
            transform: "translateY(-14px)",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1,
            color: "#fff",
            background: "rgba(0,0,0,0.6)",
            padding: "1px 3px",
            borderRadius: 3,
            whiteSpace: "nowrap",
          }}
        >
          {pin.label}
        </div>
      </Html>
    </group>
  )
}

/** All draggable pin handles for the current board's Arduino header. */
export function ArduinoPinCalibrator() {
  const boardTarget = useBoardSelector((ctx) => ctx.boardTarget)
  const pins = useMemo(() => getBoardPinLayout(boardTarget).allPins, [boardTarget])
  return (
    <group name="arduino-pin-calibrator">
      {pins.map((pin) => (
        <PinHandle key={pin.pin} pin={pin} />
      ))}
    </group>
  )
}

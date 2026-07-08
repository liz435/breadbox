// ── Physics colliders for the static surfaces ────────────────────────────────
//
// The boards themselves stay grid-driven (BoardSurfaces draws them); this adds
// the fixed collision geometry parts and props rest on. A standalone
// <CuboidCollider> (no parent RigidBody) is fixed by default. One box per
// breadboard at its world offset, one for the Arduino PCB, and a large desk
// floor so an imported prop that misses the board still lands somewhere.

import { useMemo } from "react"
import { CuboidCollider } from "@react-three/rapier"
import { useBoardSelector } from "@/store/board-context"
import { boardOffset, offsetToWorld, surfaceBoardsOf } from "./board-offsets"
import {
  ARDUINO_RECT_PX,
  BREADBOARD_RECT_PX,
  BREADBOARD_THICKNESS_MM,
  PCB_THICKNESS_MM,
  pixelToWorld,
  pxToMm,
  type WorldPoint,
} from "./layout"

const BREADBOARD_CENTER = pixelToWorld(
  BREADBOARD_RECT_PX.x + BREADBOARD_RECT_PX.width / 2,
  BREADBOARD_RECT_PX.y + BREADBOARD_RECT_PX.height / 2,
)
const ARDUINO_CENTER = pixelToWorld(
  ARDUINO_RECT_PX.x + ARDUINO_RECT_PX.width / 2,
  ARDUINO_RECT_PX.y + ARDUINO_RECT_PX.height / 2,
)

function BreadboardCollider({ offset }: { offset: WorldPoint }) {
  const half: [number, number, number] = [
    pxToMm(BREADBOARD_RECT_PX.width) / 2,
    BREADBOARD_THICKNESS_MM / 2,
    pxToMm(BREADBOARD_RECT_PX.height) / 2,
  ]
  return (
    <CuboidCollider
      args={half}
      position={[
        BREADBOARD_CENTER.x + offset.x,
        BREADBOARD_THICKNESS_MM / 2,
        BREADBOARD_CENTER.z + offset.z,
      ]}
    />
  )
}

export function PhysicsBoards() {
  const components = useBoardSelector((ctx) => ctx.components)
  const offsets = useMemo(() => {
    const surfaces = surfaceBoardsOf(components)
    if (surfaces.length === 0) return [{ x: 0, z: 0 } as WorldPoint]
    return surfaces.map((board) => offsetToWorld(boardOffset(board)))
  }, [components])

  return (
    <group name="physics-boards">
      {/* Desk floor: a thin fixed slab whose top sits at y=0 (the board bottoms). */}
      <CuboidCollider args={[700, 0.5, 700]} position={[0, -0.5, 0]} />
      {/* Arduino PCB. */}
      <CuboidCollider
        args={[pxToMm(ARDUINO_RECT_PX.width) / 2, PCB_THICKNESS_MM / 2, pxToMm(ARDUINO_RECT_PX.height) / 2]}
        position={[ARDUINO_CENTER.x, PCB_THICKNESS_MM / 2, ARDUINO_CENTER.z]}
      />
      {offsets.map((offset, i) => (
        // eslint-disable-next-line react/no-array-index-key -- colliders are positional, rebuilt atomically with the board set
        <BreadboardCollider key={i} offset={offset} />
      ))}
    </group>
  )
}

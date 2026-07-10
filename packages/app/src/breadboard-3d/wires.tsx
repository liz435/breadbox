// ── 3D jumper wires ─────────────────────────────────────────────────────────
//
// Renders every wire in the board state as a jumper-wire hop: a tube that
// leaves its hole vertically, arcs over the board, and drops into the other
// hole. Endpoint resolution mirrors the 2D wire renderer — breadboard grid
// holes via gridToPixel, Arduino pins via the -999 sentinel — then maps to
// world mm. Arc heights vary a little per wire (seeded by id) so parallel
// wires don't z-fight through each other.

import { memo, useMemo } from "react"
import { CubicBezierCurve3, Quaternion, Vector3 } from "three"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import { useBoardSelector } from "@/store/board-context"
import {
  getBoardPinLayout,
  gridToPixel,
  type ArduinoPinInfo,
} from "@/breadboard/breadboard-grid"
import { offsetToWorld, surfaceBoardsOf, wireEndpointOffset } from "./board-offsets"
import { BOARD_SURFACE_Y, pixelToWorld } from "./layout"
import { calibratedPinXZ } from "./arduino-calibration"
import { segmentClosest, partObstacles, type PartObstacle } from "./part-obstacles"

/** Slim jumper insulation radius (mm). */
const WIRE_RADIUS_MM = 0.5

// Dupont jumper end connector, matched to wire.glb: a black plastic housing the
// wire emerges from, plus a thin metal pin that plugs into the hole. buildCurve
// floors the arc rise above HOUSING_LEN so trimming the tube back to the housing
// top never inverts a short wire's curve.
const HOUSING_R = 0.85
const HOUSING_LEN = 7
const PIN_R = 0.28
const PIN_LEN = 2.4
const Y_AXIS = new Vector3(0, 1, 0)

/** Quaternion (as an array prop) that rotates the connector's local +Y onto
 *  `dir` — the direction the wire leaves the hole. */
function endQuaternion(dir: Vector3): [number, number, number, number] {
  const q = new Quaternion().setFromUnitVectors(Y_AXIS, dir.clone().normalize())
  return [q.x, q.y, q.z, q.w]
}

/** One jumper end: the black housing extends up along the wire, the metal pin
 *  drops into the hole below the endpoint. */
function WireEndConnector({ at, dir }: { at: Vector3; dir: Vector3 }) {
  const quaternion = useMemo(() => endQuaternion(dir), [dir.x, dir.y, dir.z])
  return (
    <group position={[at.x, at.y, at.z]} quaternion={quaternion}>
      <mesh position={[0, HOUSING_LEN / 2, 0]}>
        <cylinderGeometry args={[HOUSING_R, HOUSING_R, HOUSING_LEN, 12]} />
        <meshStandardMaterial color="#141414" roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh position={[0, -PIN_LEN / 2, 0]}>
        <cylinderGeometry args={[PIN_R, PIN_R, PIN_LEN, 8]} />
        <meshStandardMaterial color="#c9ccd1" metalness={0.9} roughness={0.35} />
      </mesh>
    </group>
  )
}

/** Deterministic 0..1 jitter per wire so arc heights differ but stay stable. */
function idJitter(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return (Math.abs(hash) % 100) / 100
}

/** Same power/ground color normalisation the 2D renderer applies. */
export function wireColor(wire: Wire): string {
  const color = wire.color ?? "#22c55e"
  if (color === "#ef4444" || color === "#ff0000" || color === "red") return "#ef4444"
  if (color === "#000000" || color === "black") return "#1a1a1a"
  return color
}

export function fromEndpoint(
  wire: Wire,
  arduinoPins: ArduinoPinInfo[],
  surfaceBoards: BoardComponent[],
): Vector3 | null {
  if (wire.fromRow === -999) {
    const pin =
      (wire.fromPinLabel
        ? arduinoPins.find(
            (p) =>
              p.label === wire.fromPinLabel &&
              (wire.fromPinCategory ? p.category === wire.fromPinCategory : true),
          )
        : undefined) ?? arduinoPins.find((p) => p.pin === wire.fromCol)
    if (!pin) return null
    const p = calibratedPinXZ(pin.pin, pixelToWorld(pin.x, pin.y))
    return new Vector3(p.x, p.y, p.z)
  }
  const px = gridToPixel({ row: wire.fromRow, col: wire.fromCol })
  const world = pixelToWorld(px.x, px.y)
  const off = offsetToWorld(wireEndpointOffset(wire.fromBoardId, surfaceBoards))
  return new Vector3(world.x + off.x, BOARD_SURFACE_Y, world.z + off.z)
}

export function toEndpoint(wire: Wire, surfaceBoards: BoardComponent[]): Vector3 {
  const px = gridToPixel({ row: wire.toRow, col: wire.toCol })
  const world = pixelToWorld(px.x, px.y)
  const off = offsetToWorld(wireEndpointOffset(wire.toBoardId, surfaceBoards))
  return new Vector3(world.x + off.x, BOARD_SURFACE_Y, world.z + off.z)
}

/** Vertical gap kept between the wire and the part it passes over (mm). */
const WIRE_CLEARANCE_MM = 3
/** Extra horizontal margin around a part before a wire counts as "over" it. */
const WIRE_SIDE_MARGIN_MM = 1.5
/** Floor on the arc height factor so a part sitting almost under an endpoint
 *  (where the arc is near the board) doesn't demand an unbounded rise. */
const MIN_ARC_FACTOR = 0.12
/** Cap on the control-point rise (mm). A part directly under a wire's hole
 *  can't be arced over by a single hop; clamp rather than shoot to the moon. */
const MAX_WIRE_RISE_MM = 60
/** Slack (mm) added to a part's pin-spread when deciding whether a wire endpoint
 *  belongs to it. Well under one 2.54 mm hole pitch, so an adjacent hole a part
 *  merely sits near is never mistaken for one of its own pins. */
const FOOTPRINT_HIT_TOLERANCE_MM = 0.5

/** True when a wire endpoint lands on a part's own footprint — i.e. the wire
 *  plugs into that part. Such a part is the wire's destination, not an obstacle:
 *  a tall body can't be arced away at the wire's own terminus (the arc height
 *  there is ~0), so treating it as one only forces a huge rise that then plunges
 *  straight back down through the body. */
function endpointOnObstacle(point: Vector3, obstacle: PartObstacle): boolean {
  return (
    Math.hypot(point.x - obstacle.x, point.z - obstacle.z) <=
    obstacle.coreRadius + FOOTPRINT_HIT_TOLERANCE_MM
  )
}

function buildCurve(
  wire: Wire,
  arduinoPins: ArduinoPinInfo[],
  obstacles: PartObstacle[],
  surfaceBoards: BoardComponent[],
): CubicBezierCurve3 | null {
  const start = fromEndpoint(wire, arduinoPins, surfaceBoards)
  if (!start) return null
  const end = toEndpoint(wire, surfaceBoards)
  const span = start.distanceTo(end)
  // Short on-board jumpers hop low; cross-board runs rise higher. The
  // per-wire jitter keeps side-by-side wires from occupying the same arc.
  let rise = Math.min(26, 6 + span * 0.18) + idJitter(wire.id) * 5

  // Lift the arc so it clears every part it passes over — at the part's ACTUAL
  // position along the hop, not just the midpoint apex. The arc's height above
  // the endpoints scales as 3·t·(1−t)·rise (peaking at 0.75·rise at t=0.5), so a
  // part sitting off-centre is passed over where the arc is lower and needs more
  // rise than the apex formula alone would give. Using the straight-segment
  // fraction as t is conservative (the real curve sits at least this high),
  // so we never under-clear.
  const avgEndpointY = (start.y + end.y) / 2
  for (const obstacle of obstacles) {
    // The part this wire plugs into isn't something to hop over — skip it, or
    // the arc gets forced up and dives straight back down through its body.
    if (endpointOnObstacle(start, obstacle) || endpointOnObstacle(end, obstacle)) {
      continue
    }
    const { distance, t } = segmentClosest(
      obstacle.x, obstacle.z, start.x, start.z, end.x, end.z,
    )
    if (distance > obstacle.radius + WIRE_SIDE_MARGIN_MM) continue
    const factor = Math.max(MIN_ARC_FACTOR, 3 * t * (1 - t))
    const neededRise = (obstacle.topY + WIRE_CLEARANCE_MM - avgEndpointY) / factor
    rise = Math.max(rise, Math.min(neededRise, MAX_WIRE_RISE_MM))
  }

  // Keep the arc taller than the end connectors so the tube (trimmed back to
  // each housing top by HOUSING_LEN) still curves up out of them.
  rise = Math.max(rise, HOUSING_LEN + 2)

  const control1 = start.clone()
  control1.y += rise
  const control2 = end.clone()
  control2.y += rise
  return new CubicBezierCurve3(start, control1, control2, end)
}

const WireTube = memo(function WireTube({
  wire,
  arduinoPins,
  obstacles,
  surfaceBoards,
}: {
  wire: Wire
  arduinoPins: ArduinoPinInfo[]
  obstacles: PartObstacle[]
  surfaceBoards: BoardComponent[]
}) {
  // Build the arc, then trim the tube back to the top of each connector so the
  // wire emerges from the housing instead of running through it. getTangent(1)
  // points into the end hole, so negate it to face back up the wire.
  const geom = useMemo(() => {
    const curve = buildCurve(wire, arduinoPins, obstacles, surfaceBoards)
    if (!curve) return null
    const start = curve.getPoint(0)
    const end = curve.getPoint(1)
    const startDir = curve.getTangent(0)
    const endDir = curve.getTangent(1).negate()
    const tubeCurve = new CubicBezierCurve3(
      start.clone().addScaledVector(startDir, HOUSING_LEN),
      curve.v1,
      curve.v2,
      end.clone().addScaledVector(endDir, HOUSING_LEN),
    )
    return { tubeCurve, start, startDir, end, endDir }
  }, [wire, arduinoPins, obstacles, surfaceBoards])
  if (!geom) return null
  return (
    <group>
      <mesh>
        <tubeGeometry args={[geom.tubeCurve, 24, WIRE_RADIUS_MM, 8, false]} />
        <meshStandardMaterial color={wireColor(wire)} roughness={0.45} />
      </mesh>
      <WireEndConnector at={geom.start} dir={geom.startDir} />
      <WireEndConnector at={geom.end} dir={geom.endDir} />
    </group>
  )
})

export function Wires() {
  const wires = useBoardSelector((ctx) => ctx.wires)
  const boardTarget = useBoardSelector((ctx) => ctx.boardTarget)
  const components = useBoardSelector((ctx) => ctx.components)
  const arduinoPins = getBoardPinLayout(boardTarget).allPins
  const obstacles = useMemo(() => partObstacles(components), [components])
  const surfaceBoards = useMemo(() => surfaceBoardsOf(components), [components])
  return (
    <group name="wires-3d">
      {Object.values(wires).map((wire) => (
        <WireTube
          key={wire.id}
          wire={wire}
          arduinoPins={arduinoPins}
          obstacles={obstacles}
          surfaceBoards={surfaceBoards}
        />
      ))}
    </group>
  )
}

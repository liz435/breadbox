// ── 3D jumper wires ─────────────────────────────────────────────────────────
//
// Renders every wire in the board state as a jumper-wire hop: a tube that
// leaves its hole vertically, arcs over the board, and drops into the other
// hole. Endpoint resolution mirrors the 2D wire renderer — breadboard grid
// holes via gridToPixel, Arduino pins via the -999 sentinel — then maps to
// world mm. Arc heights vary a little per wire (seeded by id) so parallel
// wires don't z-fight through each other.

import { memo, useMemo } from "react"
import { CubicBezierCurve3, Vector3 } from "three"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import { useBoardSelector } from "@/store/board-context"
import {
  getBoardPinLayout,
  gridToPixel,
  type ArduinoPinInfo,
} from "@/breadboard/breadboard-grid"
import { offsetToWorld, surfaceBoardsOf, wireEndpointOffset } from "./board-offsets"
import { ARDUINO_HEADER_TOP_Y, BOARD_SURFACE_Y, pixelToWorld } from "./layout"
import { segmentClosest, partObstacles, type PartObstacle } from "./part-obstacles"

/** 22 AWG jumper insulation is ~1.6 mm across. */
const WIRE_RADIUS_MM = 0.8

/** Deterministic 0..1 jitter per wire so arc heights differ but stay stable. */
function idJitter(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return (Math.abs(hash) % 100) / 100
}

/** Same power/ground color normalisation the 2D renderer applies. */
function wireColor(wire: Wire): string {
  const color = wire.color ?? "#22c55e"
  if (color === "#ef4444" || color === "#ff0000" || color === "red") return "#ef4444"
  if (color === "#000000" || color === "black") return "#1a1a1a"
  return color
}

function fromEndpoint(
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
    const world = pixelToWorld(pin.x, pin.y)
    return new Vector3(world.x, ARDUINO_HEADER_TOP_Y, world.z)
  }
  const px = gridToPixel({ row: wire.fromRow, col: wire.fromCol })
  const world = pixelToWorld(px.x, px.y)
  const off = offsetToWorld(wireEndpointOffset(wire.fromBoardId, surfaceBoards))
  return new Vector3(world.x + off.x, BOARD_SURFACE_Y, world.z + off.z)
}

function toEndpoint(wire: Wire, surfaceBoards: BoardComponent[]): Vector3 {
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
  const curve = useMemo(
    () => buildCurve(wire, arduinoPins, obstacles, surfaceBoards),
    [wire, arduinoPins, obstacles, surfaceBoards],
  )
  if (!curve) return null
  return (
    <mesh>
      <tubeGeometry args={[curve, 24, WIRE_RADIUS_MM, 8, false]} />
      <meshStandardMaterial color={wireColor(wire)} roughness={0.45} />
    </mesh>
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

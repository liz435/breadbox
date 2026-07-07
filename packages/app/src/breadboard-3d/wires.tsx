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
import type { Wire } from "@dreamer/schemas"
import { useBoardSelector } from "@/store/board-context"
import {
  getBoardPinLayout,
  gridToPixel,
  type ArduinoPinInfo,
} from "@/breadboard/breadboard-grid"
import { ARDUINO_HEADER_TOP_Y, BOARD_SURFACE_Y, pixelToWorld } from "./layout"

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

function fromEndpoint(wire: Wire, arduinoPins: ArduinoPinInfo[]): Vector3 | null {
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
  return new Vector3(world.x, BOARD_SURFACE_Y, world.z)
}

function toEndpoint(wire: Wire): Vector3 {
  const px = gridToPixel({ row: wire.toRow, col: wire.toCol })
  const world = pixelToWorld(px.x, px.y)
  return new Vector3(world.x, BOARD_SURFACE_Y, world.z)
}

function buildCurve(wire: Wire, arduinoPins: ArduinoPinInfo[]): CubicBezierCurve3 | null {
  const start = fromEndpoint(wire, arduinoPins)
  if (!start) return null
  const end = toEndpoint(wire)
  const span = start.distanceTo(end)
  // Short on-board jumpers hop low; cross-board runs rise higher. The
  // per-wire jitter keeps side-by-side wires from occupying the same arc.
  const rise = Math.min(26, 6 + span * 0.18) + idJitter(wire.id) * 5
  const control1 = start.clone()
  control1.y += rise
  const control2 = end.clone()
  control2.y += rise
  return new CubicBezierCurve3(start, control1, control2, end)
}

const WireTube = memo(function WireTube({
  wire,
  arduinoPins,
}: {
  wire: Wire
  arduinoPins: ArduinoPinInfo[]
}) {
  const curve = useMemo(() => buildCurve(wire, arduinoPins), [wire, arduinoPins])
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
  const arduinoPins = getBoardPinLayout(boardTarget).allPins
  return (
    <group name="wires-3d">
      {Object.values(wires).map((wire) => (
        <WireTube key={wire.id} wire={wire} arduinoPins={arduinoPins} />
      ))}
    </group>
  )
}

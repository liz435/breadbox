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
import { getBoardPinLayout, type ArduinoPinInfo } from "@/breadboard/breadboard-grid"
import { offsetToWorld, partBoardOffset, surfaceBoardsOf, wireEndpointOffset } from "./board-offsets"
import { pixelToWorld } from "./layout"
import { calibratedPinXZ, useCalibration } from "./arduino-calibration"
import { useGridCalibration, warpedGridXZ } from "./breadboard-grid-calibration"
import { componentFootprint, computePinFit, footprintCenter, rotationYaw } from "./part-frame"
import { partObstacles, type PartObstacle } from "./part-obstacles"
import { useBoundsVersion } from "./part-volume"
import { usePinCalibrations } from "./component-pin-calibration"
import { useAssemblyObstacles } from "./assembly-obstacles"
import { bezierArcFactor, resolveWireArcRise } from "./wire-routing"
import { remapWireEndpoints } from "./wire-endpoint-clearance"

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
  const p = warpedGridXZ(wire.fromRow, wire.fromCol)
  const off = offsetToWorld(wireEndpointOffset(wire.fromBoardId, surfaceBoards))
  return new Vector3(p.x + off.x, p.y, p.z + off.z)
}

export function toEndpoint(wire: Wire, surfaceBoards: BoardComponent[]): Vector3 {
  const p = warpedGridXZ(wire.toRow, wire.toCol)
  const off = offsetToWorld(wireEndpointOffset(wire.toBoardId, surfaceBoards))
  return new Vector3(p.x + off.x, p.y, p.z + off.z)
}

/** Vertical gap kept between the wire and the part it passes over (mm). */
const WIRE_CLEARANCE_MM = 2
/** Extra horizontal margin around a part before a wire counts as "over" it. */
const WIRE_SIDE_MARGIN_MM = 1.5
/** Floor on the arc height factor so a part sitting almost under an endpoint
 *  (where the arc is near the board) doesn't demand an unbounded rise. Kept
 *  fairly high so a tall part right beside an endpoint hole nudges the arc up a
 *  little rather than launching it into a tall spike. */
const MIN_ARC_FACTOR = 0.3
/** Cap on the control-point rise (mm). High enough that the tallest catalog
 *  part (the 24 mm servo) still clears a mid-span crossing, low enough that an
 *  oversized uploaded model saturates into a normal-looking hop instead of a
 *  half-circle to the ceiling. */
const MAX_WIRE_RISE_MM = 35
/** Slack (mm) added to a part's pin-spread when deciding whether a wire endpoint
 *  belongs to it. Well under one 2.54 mm hole pitch, so an adjacent hole a part
 *  merely sits near is never mistaken for one of its own pins. */
const FOOTPRINT_HIT_TOLERANCE_MM = 0.5

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
  // Short on-board jumpers hop low; cross-board runs rise a little higher. The
  // per-wire jitter keeps side-by-side wires from occupying the same arc. Kept
  // shallow so jumpers drape near the board instead of arcing up in tall loops.
  const rise = resolveWireArcRise(start, end, obstacles, {
    baseRise: Math.min(16, 4 + span * 0.1) + idJitter(wire.id) * 3,
    clearanceMm: WIRE_CLEARANCE_MM, maxRiseMm: MAX_WIRE_RISE_MM,
    sideMarginMm: WIRE_SIDE_MARGIN_MM, plugToleranceMm: FOOTPRINT_HIT_TOLERANCE_MM,
    minArcFactor: MIN_ARC_FACTOR, arcFactor: bezierArcFactor,
  })

  // Keep the arc taller than the end connectors so the tube (trimmed back to
  // each housing top by HOUSING_LEN) still curves up out of them.
  const finalRise = Math.max(rise, HOUSING_LEN + 2)

  const control1 = start.clone()
  control1.y += finalRise
  const control2 = end.clone()
  control2.y += finalRise
  return new CubicBezierCurve3(start, control1, control2, end)
}

const WireTube = memo(function WireTube({
  wire,
  curve: suppliedCurve,
  tubeCurve: suppliedTubeCurve,
  color: suppliedColor,
  startConnector = true,
  endConnector = true,
  startConnectorDir,
  endConnectorDir,
  arduinoPins,
  obstacles,
  surfaceBoards,
  calibration,
  arduinoCal,
}: {
  /** Board wire input. Omit when rendering a standalone cable curve. */
  wire?: Wire
  /** Optional prebuilt curve for component pigtails such as servo leads. */
  curve?: CubicBezierCurve3
  /** Optional tube-only curve, kept independent from connector orientation. */
  tubeCurve?: CubicBezierCurve3
  /** Override the normal board-wire colour for a standalone cable. */
  color?: string
  /** Component pigtails usually have no connector at the body exit. */
  startConnector?: boolean
  endConnector?: boolean
  /** Optional connector axis; useful when a cable's final tangent is oblique. */
  startConnectorDir?: Vector3
  endConnectorDir?: Vector3
  arduinoPins?: ArduinoPinInfo[]
  obstacles?: PartObstacle[]
  surfaceBoards?: BoardComponent[]
  // These only invalidate the geom memo when a calibration moves; the endpoint
  // resolvers read live values (warpedGridXZ / calibratedPinXZ). `calibration`
  // is the breadboard grid warp; `arduinoCal` is the Arduino header alignment.
  calibration?: unknown
  arduinoCal?: unknown
}) {
  // Build the arc, then trim the tube back to the top of each connector so the
  // wire emerges from the housing instead of running through it. getTangent(1)
  // points into the end hole, so negate it to face back up the wire.
  const geom = useMemo(() => {
    const curve = suppliedCurve ?? (
      wire && arduinoPins && obstacles && surfaceBoards
        ? buildCurve(wire, arduinoPins, obstacles, surfaceBoards)
        : null
    )
    if (!curve) return null
    const start = curve.getPoint(0)
    const end = curve.getPoint(1)
    const startDir = curve.getTangent(0)
    const endDir = curve.getTangent(1).negate()
    const trimmedStartDir = startConnectorDir ?? startDir
    const trimmedEndDir = endConnectorDir ?? endDir
    const tubePath = suppliedTubeCurve ?? new CubicBezierCurve3(
      startConnector ? start.clone().addScaledVector(trimmedStartDir, HOUSING_LEN) : start,
      curve.v1,
      curve.v2,
      endConnector ? end.clone().addScaledVector(trimmedEndDir, HOUSING_LEN) : end,
    )
    return { tubeCurve: tubePath, start, startDir: trimmedStartDir, end, endDir: trimmedEndDir }
  }, [
    wire,
    suppliedCurve,
    suppliedTubeCurve,
    arduinoPins,
    obstacles,
    surfaceBoards,
    startConnector,
    endConnector,
    startConnectorDir,
    endConnectorDir,
    calibration,
    arduinoCal,
  ])
  if (!geom) return null
  return (
    <group>
      {/* Jumpers arcing over the board are exactly what a viewer uses to judge
          how high a wire is riding, so they cast. They do not receive — a thin
          tube self-shadowing at this radius reads as noise, not shading. */}
      <mesh castShadow>
        <tubeGeometry args={[geom.tubeCurve, 24, WIRE_RADIUS_MM, 8, false]} />
        <meshStandardMaterial color={suppliedColor ?? (wire ? wireColor(wire) : "#22c55e")} roughness={0.45} />
      </mesh>
      {startConnector && <WireEndConnector at={geom.start} dir={geom.startDir} />}
      {endConnector && <WireEndConnector at={geom.end} dir={geom.endDir} />}
    </group>
  )
})

export function Wires() {
  const storedWires = useBoardSelector((ctx) => ctx.wires)
  const boardTarget = useBoardSelector((ctx) => ctx.boardTarget)
  const components = useBoardSelector((ctx) => ctx.components)
  // Slide endpoints that share a hole with a part pin (or sit under a part
  // body) to a free hole on the same strip — same net, no more wire-through-
  // part clipping at the plug (see wire-endpoint-clearance.ts).
  const wires = useMemo(
    () => remapWireEndpoints(storedWires, components),
    [storedWires, components],
  )
  const arduinoPins = getBoardPinLayout(boardTarget).allPins
  const pinCals = usePinCalibrations()
  const uploadedObstacles = useAssemblyObstacles()
  // GLB body extents arrive as parts render; rebuild obstacles when they do (and
  // when a calibration moves a part) so the OBBs track the rendered geometry.
  const boundsVersion = useBoundsVersion()
  const obstacles = useMemo(
    () => [...partObstacles(components, pinCals), ...uploadedObstacles],
    [components, pinCals, boundsVersion, uploadedObstacles],
  )
  const surfaceBoards = useMemo(() => surfaceBoardsOf(components), [components])
  // Re-tube whenever a grid anchor / surface height or an Arduino pin moves.
  const calibration = useGridCalibration()
  const arduinoCal = useCalibration()
  return (
    <group name="wires-3d">
      {Object.values(wires).map((wire) => (
        <WireTube
          key={wire.id}
          wire={wire}
          arduinoPins={arduinoPins}
          obstacles={obstacles}
          surfaceBoards={surfaceBoards}
          calibration={calibration}
          arduinoCal={arduinoCal}
        />
      ))}
    </group>
  )
}

// A hobby servo's three leads leave the body as a short pigtail before landing
// in the three footprint holes. The stored board wires then continue from those
// holes to the project's actual signal, VCC, and GND destinations. Keeping this
// visual pigtail separate from Wires means it also stays visible in physics mode.
const SERVO_LEAD_COLORS = ["#f2a93b", "#ef4444", "#6b3f2a"] as const
const SERVO_EXIT_HEIGHT_MM = 12
const SERVO_EXIT_FORWARD_MM = 7
const SERVO_LEAD_SIDE_SLACK_MM = 4.8
const SERVO_LEAD_LIFT_MM = 7

function servoCableLeads(
  component: BoardComponent,
  surfaceBoards: BoardComponent[],
  pinCals: ReturnType<typeof usePinCalibrations>,
): Array<{ curve: CubicBezierCurve3; tubeCurve: CubicBezierCurve3; color: string; key: string }> {
  const footprint = componentFootprint(component)
  if (footprint.points.length < SERVO_LEAD_COLORS.length) return []

  const offset = offsetToWorld(partBoardOffset(component, surfaceBoards))
  const pins = footprint.points.slice(0, SERVO_LEAD_COLORS.length).map((point) => {
    const target = warpedGridXZ(point.row, point.col)
    return new Vector3(target.x + offset.x, target.y + 0.25, target.z + offset.z)
  })
  const center = footprintCenter(component)
  const fit = computePinFit(component, pinCals[component.type])
  const modelOffset = new Vector3(fit?.tx ?? 0, 0, fit?.tz ?? 0).applyAxisAngle(
    Y_AXIS,
    rotationYaw(component.rotation),
  )
  const pinAxis = pins[pins.length - 1].clone().sub(pins[0])
  pinAxis.y = 0
  if (pinAxis.lengthSq() < 1e-6) return []
  pinAxis.normalize()

  // The SG90 cable exits from the end of the body, in the same direction as
  // the pin row. Fan the three leads slightly across the connector before they
  // drop into their respective holes.
  const sideAxis = new Vector3(-pinAxis.z, 0, pinAxis.x)
  const exitBase = new Vector3(
    center.x + offset.x + modelOffset.x,
    pins[0].y + SERVO_EXIT_HEIGHT_MM,
    center.z + offset.z + modelOffset.z,
  ).addScaledVector(pinAxis, SERVO_EXIT_FORWARD_MM)
  const fanOffsets = [-0.8, 0, 0.8]

  return pins.map((pin, index) => {
    const start = exitBase.clone().addScaledVector(sideAxis, fanOffsets[index])
    // Pull both control points to one side of the chord and lift them above
    // it. Without this deliberate slack the pigtail reads as a taut straight
    // segment in the oblique camera, even though it is technically a Bezier.
    const control1 = start.clone().lerp(pin, 0.3)
    const control2 = start.clone().lerp(pin, 0.7)
    control1.addScaledVector(sideAxis, SERVO_LEAD_SIDE_SLACK_MM)
    control2.addScaledVector(sideAxis, SERVO_LEAD_SIDE_SLACK_MM)
    control1.y += SERVO_LEAD_LIFT_MM
    control2.y += SERVO_LEAD_LIFT_MM
    const tubeEnd = pin.clone().addScaledVector(Y_AXIS, HOUSING_LEN)
    const tubeControl1 = start.clone().lerp(tubeEnd, 0.3)
    const tubeControl2 = start.clone().lerp(tubeEnd, 0.7)
    tubeControl1.addScaledVector(sideAxis, SERVO_LEAD_SIDE_SLACK_MM)
    tubeControl2.addScaledVector(sideAxis, SERVO_LEAD_SIDE_SLACK_MM)
    tubeControl1.y += SERVO_LEAD_LIFT_MM
    tubeControl2.y += SERVO_LEAD_LIFT_MM
    return {
      curve: new CubicBezierCurve3(start, control1, control2, pin),
      tubeCurve: new CubicBezierCurve3(start, tubeControl1, tubeControl2, tubeEnd),
      color: SERVO_LEAD_COLORS[index],
      key: `${component.id}-${index}`,
    }
  })
}

/** Always-visible servo pigtails, including when Rapier owns the board wires. */
export function ServoCables() {
  const components = useBoardSelector((ctx) => ctx.components)
  const surfaceBoards = useMemo(() => surfaceBoardsOf(components), [components])
  const calibration = useGridCalibration()
  const pinCals = usePinCalibrations()
  const servos = useMemo(
    () => Object.values(components).filter((component) => component.type === "servo"),
    [components],
  )
  const leads = useMemo(
    () => servos.flatMap((servo) => servoCableLeads(servo, surfaceBoards, pinCals)),
    [servos, surfaceBoards, calibration, pinCals],
  )

  return (
    <group name="servo-cables-3d">
      {leads.map((lead) => (
        <WireTube
          key={lead.key}
          curve={lead.curve}
          tubeCurve={lead.tubeCurve}
          color={lead.color}
          startConnector={false}
          endConnector
          endConnectorDir={Y_AXIS}
        />
      ))}
    </group>
  )
}

// ── Physics jumper wires ─────────────────────────────────────────────────────
//
// A jumper isn't a limp string — at breadboard scale a 22 AWG wire is stiff
// enough that gravity barely bends it; it holds an arc between its two holes and
// only flexes when something pushes it. A pure gravity rope can't do that: with
// both ends at board level the only place its slack can go is DOWN, so it
// collapses flat onto the board. So we model each wire as a semi-rigid arc:
//
//   • nodes are initialised along an arch that bows up off the board,
//   • gravityScale = 0, so it doesn't droop,
//   • structural springs (i, i+1) hold node spacing and bending springs
//     (i, i+2) resist the arch folding — together they hold the shape and
//     spring back after a part pushes through,
//   • the two endpoints are kinematic, pinned to their holes (following a
//     board/part that moved).
//
// The visible wire is unit cylinders repositioned between consecutive nodes
// each frame — no per-frame geometry rebuild.

import { memo, useEffect, useMemo, useRef } from "react"
import type { RefObject } from "react"
import { Quaternion, Vector3, type Mesh } from "three"
import { useFrame } from "@react-three/fiber"
import {
  BallCollider,
  RigidBody,
  useSpringJoint,
  type RapierRigidBody,
} from "@react-three/rapier"
import type { Wire } from "@dreamer/schemas"
import { useBoardSelector } from "@/store/board-context"
import { getBoardPinLayout, type ArduinoPinInfo } from "@/breadboard/breadboard-grid"
import type { BoardComponent } from "@dreamer/schemas"
import { surfaceBoardsOf } from "./board-offsets"
import { GROUP_WIRE } from "./physics-groups"
import { partObstacles, segmentClosest, type PartObstacle } from "./part-obstacles"
import { obbSegmentInterval, useBoundsVersion } from "./part-volume"
import { usePinCalibrations } from "./component-pin-calibration"
import { wakePhysics } from "./physics-activity"
import { fromEndpoint, toEndpoint, wireColor } from "./wires"

/** 22 AWG jumper insulation is ~1.6 mm across. */
const WIRE_RADIUS_MM = 0.8
/** Nodes per wire (endpoints + interior). Enough for a smooth arch, few enough
 *  that a sceneful of wires stays light. */
const NODES = 7
/** Spring gains. With gravityScale 0 the resting arch needs no force, so these
 *  only govern how the wire flexes and recovers when something pushes it. */
const STRUCT_STIFFNESS = 4000
const STRUCT_DAMPING = 40
const BEND_STIFFNESS = 1500
const BEND_DAMPING = 30

const ZERO = new Vector3(0, 0, 0)
const UP = new Vector3(0, 1, 0)

/** Vertical gap kept between a wire and a part it arcs over (mm). */
const CLEARANCE_MM = 4
/** Cap on the arc rise; a part right under an endpoint can't be hopped. */
const MAX_RISE_MM = 60
/** A wire whose end lands within a part's pin spread plugs into it — don't try
 *  to arc over the very part it connects to. */
const PLUG_TOLERANCE_MM = 0.5

/** Arc rise that clears every part the wire passes over, mirroring the bezier
 *  renderer. The node arch is `rise · 4t(1−t)` (peak = rise at t=0.5), so the
 *  clearance factor uses 4t(1−t) to match. */
function wireArcRise(start: Vector3, end: Vector3, obstacles: PartObstacle[]): number {
  const span = start.distanceTo(end)
  let rise = Math.min(24, 6 + span * 0.18)
  const avgY = (start.y + end.y) / 2
  for (const o of obstacles) {
    const plugsStart = Math.hypot(start.x - o.x, start.z - o.z) <= o.coreRadius + PLUG_TOLERANCE_MM
    const plugsEnd = Math.hypot(end.x - o.x, end.z - o.z) <= o.coreRadius + PLUG_TOLERANCE_MM
    if (o.kind === "disc") {
      if (plugsStart || plugsEnd) continue
      const { distance, t } = segmentClosest(o.x, o.z, start.x, start.z, end.x, end.z)
      if (distance > o.radius + 1.5) continue
      const factor = Math.max(0.12, 4 * t * (1 - t))
      const needed = (o.topY + CLEARANCE_MM - avgY) / factor
      rise = Math.max(rise, Math.min(needed, MAX_RISE_MM))
      continue
    }
    // Oriented body box: clear it over the span the wire crosses it, keeping the
    // required clearance out of the header zone of an endpoint that plugs in.
    const interval = obbSegmentInterval(o.obb, start.x, start.z, end.x, end.z, 1.5)
    if (!interval) continue
    let { t0, t1 } = interval
    if (plugsStart || plugsEnd) {
      const clampFrac =
        span > 1e-6 ? Math.min(0.49, (o.coreRadius + PLUG_TOLERANCE_MM) / span) : 0.49
      if (plugsStart) t0 = Math.max(t0, clampFrac)
      if (plugsEnd) t1 = Math.min(t1, 1 - clampFrac)
      if (t0 >= t1) continue
    }
    const tWorst = Math.abs(t0 - 0.5) >= Math.abs(t1 - 0.5) ? t0 : t1
    const factor = Math.max(0.12, 4 * tWorst * (1 - tWorst))
    const clearance = o.obb.topY + CLEARANCE_MM - avgY
    rise = Math.max(rise, Math.min(clearance / factor, Math.max(MAX_RISE_MM, clearance + 4)))
  }
  return rise
}

/** One spring between two nodes (a joint hook must live in a component). */
function SpringLink({
  a,
  b,
  length,
  stiffness,
  damping,
}: {
  a: RefObject<RapierRigidBody | null>
  b: RefObject<RapierRigidBody | null>
  length: number
  stiffness: number
  damping: number
}) {
  // @ts-expect-error upstream ref typing predates React 19 non-null RefObject
  useSpringJoint(a, b, [ZERO, ZERO, length, stiffness, damping])
  return null
}

const WireRope = memo(function WireRope({
  wire,
  start,
  end,
  obstacles,
}: {
  wire: Wire
  start: Vector3
  end: Vector3
  obstacles: PartObstacle[]
}) {
  const bodies = useRef<RefObject<RapierRigidBody | null>[]>(
    Array.from({ length: NODES }, () => ({ current: null })),
  ).current
  const segments = useRef<(Mesh | null)[]>([])
  const color = useMemo(() => wireColor(wire), [wire])

  // Rest layout: an arch bowing up off the board between the two holes. Peak
  // rise scales with the span, matching the look of the 2D/bezier jumper.
  const rest = useMemo(() => {
    const rise = wireArcRise(start, end, obstacles)
    const points: Vector3[] = []
    for (let i = 0; i < NODES; i++) {
      const t = i / (NODES - 1)
      points.push(
        new Vector3(
          start.x + (end.x - start.x) * t,
          start.y + (end.y - start.y) * t + rise * 4 * t * (1 - t),
          start.z + (end.z - start.z) * t,
        ),
      )
    }
    return points
  }, [start, end, obstacles])

  // Spring definitions: structural (adjacent) + bending (skip-one). Rest length
  // = the arched distance, so the wire is at rest in its arc.
  const springs = useMemo(() => {
    const list: { key: string; i: number; j: number; length: number; stiffness: number; damping: number }[] = []
    for (let i = 0; i < NODES - 1; i++) {
      list.push({
        key: `s${i}`,
        i,
        j: i + 1,
        length: rest[i].distanceTo(rest[i + 1]),
        stiffness: STRUCT_STIFFNESS,
        damping: STRUCT_DAMPING,
      })
    }
    for (let i = 0; i < NODES - 2; i++) {
      list.push({
        key: `b${i}`,
        i,
        j: i + 2,
        length: rest[i].distanceTo(rest[i + 2]),
        stiffness: BEND_STIFFNESS,
        damping: BEND_DAMPING,
      })
    }
    return list
  }, [rest])

  const dir = useMemo(() => new Vector3(), [])
  const quat = useMemo(() => new Quaternion(), [])
  const mid = useMemo(() => new Vector3(), [])
  const a = useMemo(() => new Vector3(), [])
  const b = useMemo(() => new Vector3(), [])

  // Lay out the wire once on mount.
  useEffect(() => {
    wakePhysics()
  }, [])

  useFrame(() => {
    // Pin the endpoints to their holes (follows a board/part that moved).
    bodies[0].current?.setNextKinematicTranslation(start)
    bodies[NODES - 1].current?.setNextKinematicTranslation(end)
    // Lay each cylinder between two consecutive node positions.
    for (let i = 0; i < NODES - 1; i++) {
      const bodyA = bodies[i].current
      const bodyB = bodies[i + 1].current
      const cyl = segments.current[i]
      if (!bodyA || !bodyB || !cyl) continue
      const ta = bodyA.translation()
      const tb = bodyB.translation()
      a.set(ta.x, ta.y, ta.z)
      b.set(tb.x, tb.y, tb.z)
      dir.subVectors(b, a)
      const len = dir.length() || 0.001
      mid.addVectors(a, b).multiplyScalar(0.5)
      cyl.position.copy(mid)
      cyl.quaternion.copy(quat.setFromUnitVectors(UP, dir.divideScalar(len)))
      cyl.scale.set(1, len, 1)
    }
  })

  return (
    <group name={`wire-rope-${wire.id}`}>
      {rest.map((point, i) => (
        <RigidBody
          // eslint-disable-next-line react/no-array-index-key -- fixed-length node chain, rebuilt atomically per wire
          key={i}
          ref={bodies[i]}
          type={i === 0 || i === NODES - 1 ? "kinematicPosition" : "dynamic"}
          position={[point.x, point.y, point.z]}
          colliders={false}
          gravityScale={0}
          linearDamping={2}
          collisionGroups={GROUP_WIRE}
          canSleep
        >
          <BallCollider args={[WIRE_RADIUS_MM]} />
        </RigidBody>
      ))}
      {springs.map((spring) => (
        <SpringLink
          // The rest length is baked into the joint at creation — useSpringJoint
          // builds it once and never reacts to a changed `length` prop. When the
          // arch is recomputed (a tall part appears under the wire) the nodes
          // teleport to the new arc but the springs would keep their old rest
          // lengths and haul the wire back down through the obstacle. Keying on
          // the length remounts the link so the joint is rebuilt.
          key={`${spring.key}:${spring.length.toFixed(2)}`}
          a={bodies[spring.i]}
          b={bodies[spring.j]}
          length={spring.length}
          stiffness={spring.stiffness}
          damping={spring.damping}
        />
      ))}
      {Array.from({ length: NODES - 1 }).map((_, i) => (
        <mesh
          // eslint-disable-next-line react/no-array-index-key -- fixed-length segment chain
          key={i}
          ref={(el) => {
            segments.current[i] = el
          }}
        >
          <cylinderGeometry args={[WIRE_RADIUS_MM, WIRE_RADIUS_MM, 1, 8]} />
          <meshStandardMaterial color={color} roughness={0.45} />
        </mesh>
      ))}
    </group>
  )
})

export function PhysicsWires() {
  const wires = useBoardSelector((ctx) => ctx.wires)
  const boardTarget = useBoardSelector((ctx) => ctx.boardTarget)
  const components = useBoardSelector((ctx) => ctx.components)
  const arduinoPins = useMemo<ArduinoPinInfo[]>(
    () => getBoardPinLayout(boardTarget).allPins,
    [boardTarget],
  )
  const surfaceBoards = useMemo<BoardComponent[]>(
    () => surfaceBoardsOf(components),
    [components],
  )
  // Parts the wires must arc over, so a jumper clears a tall part instead of
  // spearing through it (physics collision alone is too coarse for thin wires).
  const pinCals = usePinCalibrations()
  const boundsVersion = useBoundsVersion()
  const obstacles = useMemo(
    () => partObstacles(components, pinCals),
    [components, pinCals, boundsVersion],
  )

  return (
    <group name="physics-wires">
      {Object.values(wires).map((wire) => (
        <WireRopeForWire
          key={wire.id}
          wire={wire}
          arduinoPins={arduinoPins}
          surfaceBoards={surfaceBoards}
          obstacles={obstacles}
        />
      ))}
    </group>
  )
}

/** Resolves a wire's endpoints (stable across renders) and renders its rope. */
function WireRopeForWire({
  wire,
  arduinoPins,
  surfaceBoards,
  obstacles,
}: {
  wire: Wire
  arduinoPins: ArduinoPinInfo[]
  surfaceBoards: BoardComponent[]
  obstacles: PartObstacle[]
}) {
  const ends = useMemo(() => {
    const start = fromEndpoint(wire, arduinoPins, surfaceBoards)
    if (!start) return null
    return { start, end: toEndpoint(wire, surfaceBoards) }
  }, [wire, arduinoPins, surfaceBoards])
  if (!ends) return null
  return <WireRope wire={wire} start={ends.start} end={ends.end} obstacles={obstacles} />
}

// ── Physics jumper wires ─────────────────────────────────────────────────────
//
// The physics-mode replacement for the bezier <Wires>. Each wire is a short
// rope: a chain of RigidBodies joined by rope joints, with the two endpoints
// held kinematically at their holes (from the board state, exactly like the
// bezier renderer resolves them) and the interior nodes sagging under gravity.
// So a jumper droops and drapes over whatever sits between its ends instead of
// tracing a computed arc — and the arc-avoidance heuristics aren't needed here.
//
// The node count is fixed and small (rope-of-rigid-bodies is the heavy part of
// a physics scene); the visible wire is drawn as unit cylinders repositioned
// between consecutive nodes each frame, so nothing rebuilds geometry.

import { memo, useMemo, useRef } from "react"
import type { RefObject } from "react"
import { Quaternion, Vector3, type Mesh } from "three"
import { useFrame } from "@react-three/fiber"
import {
  BallCollider,
  RigidBody,
  useRopeJoint,
  type RapierRigidBody,
} from "@react-three/rapier"
import type { Wire } from "@dreamer/schemas"
import { useBoardSelector } from "@/store/board-context"
import { getBoardPinLayout, type ArduinoPinInfo } from "@/breadboard/breadboard-grid"
import { surfaceBoardsOf } from "./board-offsets"
import { fromEndpoint, toEndpoint, wireColor } from "./wires"

/** 22 AWG jumper insulation is ~1.6 mm across. */
const WIRE_RADIUS_MM = 0.8
/** Nodes per wire (endpoints + interior). Kept low — each is a rigid body. */
const NODES = 5
/** Rope slack per segment: >1 lets the wire bow down between its ends. */
const SLACK = 1.4

const UP = new Vector3(0, 1, 0)
const ZERO = new Vector3(0, 0, 0)

/** One rope joint between two adjacent nodes (a hook must be a component). */
function RopeLink({
  a,
  b,
  length,
}: {
  a: RefObject<RapierRigidBody | null>
  b: RefObject<RapierRigidBody | null>
  length: number
}) {
  // @react-three/rapier 2.2.0's joint hooks still type the body refs as
  // RefObject<RapierRigidBody> (non-null current), but under React 19's ref
  // types every freshly-created ref is null until mount — which the hook
  // handles at runtime. This documents that upstream gap and self-heals if the
  // library retypes it.
  // @ts-expect-error upstream ref typing predates React 19 non-null RefObject
  useRopeJoint(a, b, [ZERO, ZERO, length])
  return null
}

const WireRope = memo(function WireRope({
  wire,
  start,
  end,
}: {
  wire: Wire
  start: Vector3
  end: Vector3
}) {
  // NODES stable body refs, created once.
  const bodies = useRef<RefObject<RapierRigidBody | null>[]>(
    Array.from({ length: NODES }, () => ({ current: null })),
  ).current
  const segments = useRef<(Mesh | null)[]>([])
  const color = useMemo(() => wireColor(wire), [wire])

  const rest = useMemo(() => {
    const points: [number, number, number][] = []
    for (let i = 0; i < NODES; i++) {
      const t = i / (NODES - 1)
      points.push([
        start.x + (end.x - start.x) * t,
        start.y + (end.y - start.y) * t,
        start.z + (end.z - start.z) * t,
      ])
    }
    return points
  }, [start, end])

  const ropeLen = (start.distanceTo(end) / (NODES - 1)) * SLACK

  const dir = useMemo(() => new Vector3(), [])
  const quat = useMemo(() => new Quaternion(), [])
  const mid = useMemo(() => new Vector3(), [])
  const a = useMemo(() => new Vector3(), [])
  const b = useMemo(() => new Vector3(), [])

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
          position={point}
          colliders={false}
          linearDamping={0.8}
          canSleep
        >
          <BallCollider args={[WIRE_RADIUS_MM]} />
        </RigidBody>
      ))}
      {Array.from({ length: NODES - 1 }).map((_, i) => (
        <RopeLink
          // eslint-disable-next-line react/no-array-index-key -- fixed-length joint chain
          key={i}
          a={bodies[i]}
          b={bodies[i + 1]}
          length={ropeLen}
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
  const arduinoPins: ArduinoPinInfo[] = getBoardPinLayout(boardTarget).allPins
  const surfaceBoards = useMemo(() => surfaceBoardsOf(components), [components])

  return (
    <group name="physics-wires">
      {Object.values(wires).map((wire) => {
        const start = fromEndpoint(wire, arduinoPins, surfaceBoards)
        if (!start) return null
        const end = toEndpoint(wire, surfaceBoards)
        return <WireRope key={wire.id} wire={wire} start={start} end={end} />
      })}
    </group>
  )
}

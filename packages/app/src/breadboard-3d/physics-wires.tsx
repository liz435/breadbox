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
//
// Grab-to-reshape: pointer-down on a segment grabs the nearest interior node and
// drags it on a camera-facing plane (so you can lift the wire off the board, not
// just slide it). On release that node stays pinned where it was dropped and the
// rest of the rope drapes around it via the springs — pin several points to bend
// a wire into any shape. Double-click clears a wire's pins and it relaxes back to
// its default arch. Pins are session-only: they never touch board state, saves,
// or the 2D canvas.

import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import type { RefObject } from "react"
import { Plane, Quaternion, Vector2, Vector3, type Mesh } from "three"
import { useFrame, useThree } from "@react-three/fiber"
import type { ThreeEvent } from "@react-three/fiber"
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
import { partObstacles, type PartObstacle } from "./part-obstacles"
import { useBoundsVersion } from "./part-volume"
import { usePinCalibrations } from "./component-pin-calibration"
import { setPhysicsDragging, wakePhysics } from "./physics-activity"
import { fromEndpoint, toEndpoint, wireColor } from "./wires"
import { remapWireEndpoints } from "./wire-endpoint-clearance"
import { useAssemblyObstacles } from "./assembly-obstacles"
import { resolveWireArcRise } from "./wire-routing"

/** 22 AWG jumper insulation is ~1.6 mm across. */
const WIRE_RADIUS_MM = 0.8
/** Invisible sleeve radius (mm) around each segment. The bare wire is too thin to
 *  reliably click, so a fatter transparent cylinder is the actual grab target. */
const GRAB_RADIUS_MM = 2.2
// Rope node budget (endpoints + interior). The visible wire is straight
// cylinders between consecutive nodes, so more nodes = a smoother polyline. But
// the nodes self-collide (GROUP_WIRE includes WIRE) and adjacent BallColliders
// are 1.6 mm across, so a short jumper packed with nodes gets sub-mm segments
// whose colliders overlap and fight the springs. So node count adapts to span:
// spacing is held near TARGET_SEGMENT_MM, clamped — short jumpers stay coarse
// and stable, long runs get more nodes for a smoother drape.
const MIN_NODES = 7
const MAX_NODES = 15
const TARGET_SEGMENT_MM = 5

function wireNodeCount(span: number): number {
  const n = Math.round(span / TARGET_SEGMENT_MM) + 1
  return Math.max(MIN_NODES, Math.min(MAX_NODES, n))
}
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
/** Cap on the arc rise: past this the initial drape reads as a comedy loop
 *  (oversized uploaded models otherwise demand ceiling-height hops). Gravity
 *  settles the rope afterwards, so the cap only shapes the starting pose. */
const MAX_RISE_MM = 40
/** A wire whose end lands within a part's pin spread plugs into it — don't try
 *  to arc over the very part it connects to. */
const PLUG_TOLERANCE_MM = 0.5

/** Arc rise that clears every part the wire passes over, mirroring the bezier
 *  renderer. The node arch is `rise · 4t(1−t)` (peak = rise at t=0.5), so the
 *  clearance factor uses 4t(1−t) to match. */
function wireArcRise(start: Vector3, end: Vector3, obstacles: PartObstacle[]): number {
  const span = start.distanceTo(end)
  return resolveWireArcRise(start, end, obstacles, {
    baseRise: Math.min(24, 6 + span * 0.18), clearanceMm: CLEARANCE_MM,
    maxRiseMm: MAX_RISE_MM, sideMarginMm: 1.5, plugToleranceMm: PLUG_TOLERANCE_MM,
    minArcFactor: 0.12, arcFactor: (t) => 4 * t * (1 - t),
  })
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

/** OrbitControls exposes `enabled`; flip it off mid-drag so grabbing a wire
 *  doesn't also orbit the camera (mirrors useBodyDrag). */
type ToggleableControls = { enabled: boolean }
function isToggleable(controls: unknown): controls is ToggleableControls {
  return !!controls && typeof (controls as { enabled?: unknown }).enabled === "boolean"
}

/** Grab-to-reshape state for one rope. A grabbed interior node is driven to the
 *  pointer on a camera-facing plane and, on release, left pinned (kinematic) at
 *  its drop point; the rest of the rope drapes around it via the springs. The
 *  pinned positions live only here — nothing is persisted. */
function useWireShaping(bodies: RefObject<RapierRigidBody | null>[], nodeCount: number) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const raycaster = useThree((state) => state.raycaster)
  const controls = useThree((state) => state.controls)

  // World position each pinned interior node is held at. A ref (not state) so the
  // per-frame drive and pointer-move mutate it without re-rendering; membership
  // changes (pin added / cleared) bump a counter to recompute node body types.
  const pinned = useRef(new Map<number, Vector3>()).current
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [, bumpPins] = useReducer((n: number) => n + 1, 0)

  const plane = useMemo(() => new Plane(), [])
  const hit = useMemo(() => new Vector3(), [])
  const ndc = useMemo(() => new Vector2(), [])
  const camDir = useMemo(() => new Vector3(), [])
  const cleanup = useRef<(() => void) | null>(null)

  const endDrag = useCallback(() => {
    cleanup.current?.()
    cleanup.current = null
  }, [])

  const grabAt = useCallback(
    (point: Vector3) => {
      // Grab the interior node nearest the click; the endpoints stay pinned to
      // their holes and are never grabbable.
      let index = -1
      let best = Infinity
      for (let i = 1; i < nodeCount - 1; i++) {
        const t = bodies[i].current?.translation()
        if (!t) continue
        const d = (t.x - point.x) ** 2 + (t.y - point.y) ** 2 + (t.z - point.z) ** 2
        if (d < best) {
          best = d
          index = i
        }
      }
      const body = index >= 0 ? bodies[index].current : null
      if (!body) return

      // A second grab before the first gesture ended would strand its listeners.
      endDrag()
      setDragIndex(index)
      setPhysicsDragging(true)
      if (isToggleable(controls)) controls.enabled = false
      let moved = false

      // Drag in the plane through the node that faces the camera, so the pointer
      // can pull the wire up off the board as well as sideways.
      const t = body.translation()
      camera.getWorldDirection(camDir)
      plane.setFromNormalAndCoplanarPoint(camDir, new Vector3(t.x, t.y, t.z))

      const dom = gl.domElement
      const move = (native: PointerEvent) => {
        const rect = dom.getBoundingClientRect()
        ndc.set(
          ((native.clientX - rect.left) / rect.width) * 2 - 1,
          -((native.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        if (!raycaster.ray.intersectPlane(plane, hit)) return
        moved = true
        const stored = pinned.get(index)
        if (stored) stored.copy(hit)
        else pinned.set(index, hit.clone())
        wakePhysics()
      }
      const up = () => {
        // A click that never moved isn't a reshape — drop the pin so the node
        // relaxes back into the arch instead of freezing at the arch point.
        if (!moved) pinned.delete(index)
        endDrag()
      }
      dom.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up, { once: true })
      // A cancelled pointer never fires pointerup; without this the node stays
      // kinematic mid-air, the camera stays disabled, and physics stays pinned.
      window.addEventListener("pointercancel", endDrag, { once: true })
      cleanup.current = () => {
        dom.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        window.removeEventListener("pointercancel", endDrag)
        setDragIndex(null)
        setPhysicsDragging(false)
        if (isToggleable(controls)) controls.enabled = true
        // Recompute node body types: a just-dropped pin must stay kinematic.
        bumpPins()
      }
    },
    [bodies, nodeCount, camera, gl, raycaster, controls, plane, hit, ndc, camDir, pinned, endDrag],
  )

  /** Clear every pin on this wire; it springs back to its default arch. */
  const resetShape = useCallback(() => {
    if (pinned.size === 0) return
    pinned.clear()
    bumpPins()
    wakePhysics()
  }, [pinned])

  const isPinned = useCallback((i: number) => pinned.has(i), [pinned])

  /** Hold each pinned node at its dropped position — call inside the rope's
   *  useFrame, alongside the endpoint pinning. */
  const drivePinned = useCallback(() => {
    for (const [i, pos] of pinned) {
      bodies[i].current?.setNextKinematicTranslation(pos)
    }
  }, [bodies, pinned])

  // Drop listeners / clear the drag flag if the rope unmounts mid-drag.
  useEffect(() => endDrag, [endDrag])

  return { dragIndex, grabAt, resetShape, isPinned, drivePinned }
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
  // Node count adapts to the wire's length so short jumpers stay coarse (their
  // sub-mm segments would otherwise self-collide) and long runs drape smoothly.
  const nodeCount = useMemo(() => wireNodeCount(start.distanceTo(end)), [start, end])
  // A guarded ref, not useMemo: the body-ref array must have stable identity
  // (useMemo may be discarded and recomputed, which would detach every node ref
  // mid-frame). Rebuild it only when the count actually changes.
  const bodiesRef = useRef<RefObject<RapierRigidBody | null>[]>([])
  if (bodiesRef.current.length !== nodeCount) {
    bodiesRef.current = Array.from({ length: nodeCount }, () => ({
      current: null as RapierRigidBody | null,
    }))
  }
  const bodies = bodiesRef.current
  const segments = useRef<(Mesh | null)[]>([])
  const color = useMemo(() => wireColor(wire), [wire])
  const { dragIndex, grabAt, resetShape, isPinned, drivePinned } = useWireShaping(bodies, nodeCount)

  // A change in node count remaps every interior index, so any hand-pinned shape
  // no longer means what it did — drop the pins and let the new chain rest.
  useEffect(() => {
    resetShape()
  }, [nodeCount, resetShape])

  // Rest layout: an arch bowing up off the board between the two holes. Peak
  // rise scales with the span, matching the look of the 2D/bezier jumper.
  const rest = useMemo(() => {
    const rise = wireArcRise(start, end, obstacles)
    const points: Vector3[] = []
    for (let i = 0; i < nodeCount; i++) {
      const t = i / (nodeCount - 1)
      points.push(
        new Vector3(
          start.x + (end.x - start.x) * t,
          start.y + (end.y - start.y) * t + rise * 4 * t * (1 - t),
          start.z + (end.z - start.z) * t,
        ),
      )
    }
    return points
  }, [start, end, obstacles, nodeCount])

  // Spring definitions: structural (adjacent) + bending (skip-one). Rest length
  // = the arched distance, so the wire is at rest in its arc.
  const springs = useMemo(() => {
    const list: { key: string; i: number; j: number; length: number; stiffness: number; damping: number }[] = []
    for (let i = 0; i < nodeCount - 1; i++) {
      list.push({
        key: `s${i}`,
        i,
        j: i + 1,
        length: rest[i].distanceTo(rest[i + 1]),
        stiffness: STRUCT_STIFFNESS,
        damping: STRUCT_DAMPING,
      })
    }
    for (let i = 0; i < nodeCount - 2; i++) {
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
  }, [rest, nodeCount])

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
    // Pin the endpoints to their holes (follows a board/part that moved), then
    // hold any hand-pinned interior nodes at their dropped positions.
    bodies[0].current?.setNextKinematicTranslation(start)
    bodies[nodeCount - 1].current?.setNextKinematicTranslation(end)
    drivePinned()
    // Lay each cylinder between two consecutive node positions.
    for (let i = 0; i < nodeCount - 1; i++) {
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
          // Endpoints pin to holes; a grabbed or hand-pinned interior node is
          // held kinematic; everything else is dynamic and springs to shape.
          type={
            i === 0 || i === nodeCount - 1 || i === dragIndex || isPinned(i)
              ? "kinematicPosition"
              : "dynamic"
          }
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
      {Array.from({ length: nodeCount - 1 }).map((_, i) => (
        // The outer mesh is the invisible grab sleeve (positioned/scaled each
        // frame via segments.current[i]); the visible thin wire is its child so
        // one transform drives both. Grab reshapes, double-click clears the pins.
        <mesh
          // eslint-disable-next-line react/no-array-index-key -- fixed-length segment chain
          key={i}
          ref={(el) => {
            segments.current[i] = el
          }}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            grabAt(e.point)
          }}
          onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation()
            resetShape()
          }}
        >
          <cylinderGeometry args={[GRAB_RADIUS_MM, GRAB_RADIUS_MM, 1, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <mesh>
            <cylinderGeometry args={[WIRE_RADIUS_MM, WIRE_RADIUS_MM, 1, 8]} />
            <meshStandardMaterial color={color} roughness={0.45} />
          </mesh>
        </mesh>
      ))}
    </group>
  )
})

export function PhysicsWires() {
  const storedWires = useBoardSelector((ctx) => ctx.wires)
  const boardTarget = useBoardSelector((ctx) => ctx.boardTarget)
  const components = useBoardSelector((ctx) => ctx.components)
  // Same endpoint clearance the static wires apply (wire-endpoint-clearance.ts).
  const wires = useMemo(
    () => remapWireEndpoints(storedWires, components),
    [storedWires, components],
  )
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
  const uploadedObstacles = useAssemblyObstacles()
  const boundsVersion = useBoundsVersion()
  const obstacles = useMemo(
    () => [...partObstacles(components, pinCals), ...uploadedObstacles],
    [components, pinCals, boundsVersion, uploadedObstacles],
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

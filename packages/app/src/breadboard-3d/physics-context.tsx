// ── Physics world wrapper ────────────────────────────────────────────────────
//
// Wraps the physics scene in Rapier's <Physics> and drives the sleep side of
// the frameloop gating: the world steps every frame while awake (the canvas is
// in frameloop="always"), and once nothing is moving and no drag is in flight,
// the watcher flips the activity store back to sleep so the canvas returns to
// frameloop="demand" and the GPU idles. Waking is handled elsewhere (spawns,
// drags, and state syncs call wakePhysics()).

import { useRef } from "react"
import type { ReactNode } from "react"
import { useFrame } from "@react-three/fiber"
import { Physics, useRapier } from "@react-three/rapier"
import { isPhysicsDragging, sleepPhysics } from "./physics-activity"

/** Gravity in mm/s². Real g is 9810 mm/s²; dialled down a little so the drop
 *  reads as a calm settle (and slower impacts are gentler on the solver) rather
 *  than a snap. */
const GRAVITY_MM: [number, number, number] = [0, -5000, 0]

/** Frames the world must be fully at rest before the loop is allowed to idle.
 *  A small cushion avoids flapping demand↔always on a body that is momentarily
 *  still between micro-bounces. */
const IDLE_FRAMES_TO_SLEEP = 24

function PhysicsSleepWatcher() {
  const { world } = useRapier()
  const idleFrames = useRef(0)
  useFrame(() => {
    let awake = 0
    world.forEachActiveRigidBody(() => {
      awake += 1
    })
    if (awake > 0 || isPhysicsDragging()) {
      idleFrames.current = 0
      return
    }
    idleFrames.current += 1
    if (idleFrames.current >= IDLE_FRAMES_TO_SLEEP) sleepPhysics()
  })
  return null
}

export function PhysicsWorld({ children }: { children: ReactNode }) {
  // Fixed timestep, NOT "vary". Under our demand↔always frameloop the first
  // frame after waking carries a huge real delta (all the idle time), and
  // "vary" feeds that straight to the solver — dynamic bodies then integrate
  // one giant step and tunnel through the board and floor. A fixed step always
  // advances the same slice regardless of the wall-clock gap.
  return (
    <Physics gravity={GRAVITY_MM} timeStep={1 / 60}>
      {children}
      <PhysicsSleepWatcher />
    </Physics>
  )
}

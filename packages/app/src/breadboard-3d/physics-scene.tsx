// ── Physics scene ────────────────────────────────────────────────────────────
//
// Everything that lives inside the Rapier world, composed in one place: the
// static collision surfaces, the draggable parts and imported props, the
// sim-driven kinematic drivers, and the rope wires. SceneRoot mounts this in
// place of the grid-driven <Parts>/<Wires> when physics is enabled; the visible
// boards (BoardSurfaces) and the non-dynamic uploaded bodies still render
// outside it.

import { PhysicsWorld } from "./physics-context"
import { PhysicsBoards } from "./physics-boards"
import { PhysicsParts } from "./physics-parts"
import { PhysicsBodies } from "./physics-imports"
import { PhysicsFollowers } from "./physics-followers"
import { PhysicsWires } from "./physics-wires"

export function PhysicsScene() {
  return (
    <PhysicsWorld>
      <PhysicsBoards />
      <PhysicsParts />
      <PhysicsBodies />
      <PhysicsFollowers />
      <PhysicsWires />
    </PhysicsWorld>
  )
}

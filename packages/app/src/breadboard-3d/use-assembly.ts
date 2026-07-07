// ── Assembly doc access ─────────────────────────────────────────────────────
//
// The assembly document lives inside BoardState (board machine context), so
// edits ride the existing undo/persistence paths. These helpers give the 3D
// view a stable read + focused mutators over that field.

import { useCallback } from "react"
import type { AssemblyBody, AssemblyDoc } from "@dreamer/schemas"
import { createEmptyAssembly } from "@dreamer/schemas"
import { useBoard, useBoardSelector } from "@/store/board-context"

const EMPTY_ASSEMBLY: AssemblyDoc = createEmptyAssembly()

export function useAssemblyDoc(): AssemblyDoc {
  return useBoardSelector((ctx) => ctx.assembly) ?? EMPTY_ASSEMBLY
}

export function useAssemblyActions(): {
  addBody: (body: AssemblyBody) => void
  updateBody: (id: string, changes: Partial<AssemblyBody>) => void
  removeBody: (id: string) => void
} {
  const { state, send } = useBoard()
  const assembly = state.assembly ?? EMPTY_ASSEMBLY

  const addBody = useCallback(
    (body: AssemblyBody) => {
      send({
        type: "SET_ASSEMBLY",
        assembly: { ...assembly, bodies: { ...assembly.bodies, [body.id]: body } },
      })
    },
    [assembly, send],
  )

  const updateBody = useCallback(
    (id: string, changes: Partial<AssemblyBody>) => {
      const existing = assembly.bodies[id]
      if (!existing) return
      send({
        type: "SET_ASSEMBLY",
        assembly: {
          ...assembly,
          bodies: { ...assembly.bodies, [id]: { ...existing, ...changes } },
        },
      })
    },
    [assembly, send],
  )

  const removeBody = useCallback(
    (id: string) => {
      const { [id]: _removed, ...remaining } = assembly.bodies
      // Reparent children of the removed body to the world so they don't
      // dangle, and drop bindings that referenced it.
      const bodies: typeof remaining = {}
      for (const [bodyId, body] of Object.entries(remaining)) {
        bodies[bodyId] =
          body.parent.kind === "body" && body.parent.bodyId === id
            ? { ...body, parent: { kind: "world" } }
            : body
      }
      send({
        type: "SET_ASSEMBLY",
        assembly: {
          bodies,
          bindings: assembly.bindings.filter((b) => b.bodyId !== id),
        },
      })
    },
    [assembly, send],
  )

  return { addBody, updateBody, removeBody }
}

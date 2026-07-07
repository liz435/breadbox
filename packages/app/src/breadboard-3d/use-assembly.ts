// ── Assembly doc access ─────────────────────────────────────────────────────
//
// The assembly document lives inside BoardState (board machine context), so
// edits ride the existing undo/persistence paths. These helpers give the 3D
// view a stable read + focused mutators over that field.

import { useCallback } from "react"
import type { AssemblyBinding, AssemblyBody, AssemblyDoc } from "@dreamer/schemas"
import { createEmptyAssembly, isJointBindingChannel } from "@dreamer/schemas"
import { useBoard, useBoardSelector } from "@/store/board-context"
import { useProject } from "@/project/project-context"
import { deleteProjectAsset } from "@/project/api-client"

const EMPTY_ASSEMBLY: AssemblyDoc = createEmptyAssembly()

/** A body has one bindable joint slot and one bindable emissive slot. */
export type BindingGroup = "joint" | "emissive"

function bindingGroupOf(channel: AssemblyBinding["channel"]): BindingGroup {
  return isJointBindingChannel(channel) ? "joint" : "emissive"
}

export function useAssemblyDoc(): AssemblyDoc {
  return useBoardSelector((ctx) => ctx.assembly) ?? EMPTY_ASSEMBLY
}

export function useAssemblyActions(): {
  addBody: (body: AssemblyBody) => void
  updateBody: (id: string, changes: Partial<AssemblyBody>) => void
  removeBody: (id: string) => void
  setBodyBinding: (binding: AssemblyBinding) => void
  clearBodyBinding: (bodyId: string, group: BindingGroup) => void
} {
  const { state, send } = useBoard()
  const { projectId } = useProject()
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
      const removed = assembly.bodies[id]
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
      // Garbage-collect the uploaded model file once no surviving body
      // references it. Best-effort: a failed delete only leaves storage cruft.
      if (removed && !Object.values(bodies).some((b) => b.assetId === removed.assetId)) {
        void deleteProjectAsset(projectId, removed.assetId).catch((error) => {
          console.warn("[breadboard-3d] failed to delete orphaned model asset:", error)
        })
      }
    },
    [assembly, send, projectId],
  )

  /** Upsert a signal binding, replacing any existing binding for the same body
   * in the same channel group (joint vs. emissive). */
  const setBodyBinding = useCallback(
    (binding: AssemblyBinding) => {
      const group = bindingGroupOf(binding.channel)
      const bindings = assembly.bindings.filter(
        (b) => !(b.bodyId === binding.bodyId && bindingGroupOf(b.channel) === group),
      )
      bindings.push(binding)
      send({ type: "SET_ASSEMBLY", assembly: { ...assembly, bindings } })
    },
    [assembly, send],
  )

  const clearBodyBinding = useCallback(
    (bodyId: string, group: BindingGroup) => {
      const bindings = assembly.bindings.filter(
        (b) => !(b.bodyId === bodyId && bindingGroupOf(b.channel) === group),
      )
      send({ type: "SET_ASSEMBLY", assembly: { ...assembly, bindings } })
    },
    [assembly, send],
  )

  return { addBody, updateBody, removeBody, setBodyBinding, clearBodyBinding }
}

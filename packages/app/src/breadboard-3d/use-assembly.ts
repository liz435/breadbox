// ── Assembly doc access ─────────────────────────────────────────────────────
//
// The assembly document lives inside BoardState (board machine context), so
// edits ride the existing undo/persistence paths. These helpers give the 3D
// view a stable read + focused mutators over that field. The mutation logic
// itself is pure and lives in `assembly-edits.ts`.

import { useCallback } from "react"
import type { AssemblyBinding, AssemblyBody, AssemblyDoc } from "@dreamer/schemas"
import { createEmptyAssembly } from "@dreamer/schemas"
import { BoardContext, useBoardSelector } from "@/store/board-context"
import * as edits from "./assembly-edits"
import type { BindingGroup } from "./assembly-edits"

const EMPTY_ASSEMBLY: AssemblyDoc = createEmptyAssembly()

export type { BindingGroup }

export function useAssemblyDoc(): AssemblyDoc {
  return useBoardSelector((ctx) => ctx.assembly) ?? EMPTY_ASSEMBLY
}

export function useAssemblyActions(): {
  addBody: (body: AssemblyBody) => void
  updateBody: (id: string, changes: Partial<AssemblyBody>) => void
  duplicateBody: (id: string) => void
  reorderBody: (id: string, dir: "up" | "down") => void
  removeBody: (id: string) => void
  setBodyBinding: (binding: AssemblyBinding) => void
  clearBodyBinding: (bodyId: string, group: BindingGroup) => void
} {
  const actor = BoardContext.useActorRef()

  // Each mutator replaces the whole document, so it must read the CURRENT one.
  // Reading a render-time `assembly` would make two dispatches in the same
  // event turn (e.g. an input's onBlur commit racing a select's onChange) both
  // spread the same pre-edit snapshot, silently dropping the first edit.
  const edit = useCallback(
    (mutate: (current: AssemblyDoc) => AssemblyDoc) => {
      const current = actor.getSnapshot().context.assembly ?? EMPTY_ASSEMBLY
      actor.send({ type: "SET_ASSEMBLY", assembly: mutate(current) })
    },
    [actor],
  )

  const addBody = useCallback(
    (body: AssemblyBody) => edit((doc) => edits.addBody(doc, body)),
    [edit],
  )

  const updateBody = useCallback(
    (id: string, changes: Partial<AssemblyBody>) =>
      edit((doc) => edits.updateBody(doc, id, changes)),
    [edit],
  )

  const duplicateBody = useCallback(
    (id: string) => edit((doc) => edits.duplicateBody(doc, id)),
    [edit],
  )

  const reorderBody = useCallback(
    (id: string, dir: "up" | "down") => edit((doc) => edits.reorderBody(doc, id, dir)),
    [edit],
  )

  // The uploaded model file is intentionally NOT deleted here. SET_ASSEMBLY is
  // undoable, so a hard delete would leave Cmd+Z restoring a body whose mesh
  // 404s — with the source file already gone. The server's grace-window
  // mark-and-sweep (POST /project/:id/assets/sweep, run on project open)
  // reclaims models no surviving body references, and unmarks them if a body
  // comes back. Deletion is its job, not ours.
  const removeBody = useCallback(
    (id: string) => edit((doc) => edits.removeBody(doc, id)),
    [edit],
  )

  const setBodyBinding = useCallback(
    (binding: AssemblyBinding) => edit((doc) => edits.setBodyBinding(doc, binding)),
    [edit],
  )

  const clearBodyBinding = useCallback(
    (bodyId: string, group: BindingGroup) =>
      edit((doc) => edits.clearBodyBinding(doc, bodyId, group)),
    [edit],
  )

  return {
    addBody,
    updateBody,
    duplicateBody,
    reorderBody,
    removeBody,
    setBodyBinding,
    clearBodyBinding,
  }
}

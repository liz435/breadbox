// ── Pure assembly-document edits ────────────────────────────────────────────
//
// The mutation logic behind `useAssemblyActions`, kept free of React so the
// invariants (child reparenting, binding cleanup, one binding per group) can
// be tested directly. Every function returns a new document and never mutates
// its input.

import type { AssemblyBinding, AssemblyBody, AssemblyDoc } from "@dreamer/schemas"
import { isJointBindingChannel } from "@dreamer/schemas"

/** A body has one bindable joint slot and one bindable emissive slot. */
export type BindingGroup = "joint" | "emissive"

export function bindingGroupOf(channel: AssemblyBinding["channel"]): BindingGroup {
  return isJointBindingChannel(channel) ? "joint" : "emissive"
}

export function addBody(doc: AssemblyDoc, body: AssemblyBody): AssemblyDoc {
  return { ...doc, bodies: { ...doc.bodies, [body.id]: body } }
}

export function updateBody(
  doc: AssemblyDoc,
  id: string,
  changes: Partial<AssemblyBody>,
): AssemblyDoc {
  const existing = doc.bodies[id]
  if (!existing) return doc
  return { ...doc, bodies: { ...doc.bodies, [id]: { ...existing, ...changes } } }
}

/**
 * Drop a body, reparent its children to the world so they don't dangle on a
 * missing parent, and drop bindings that referenced it.
 *
 * Deliberately does NOT touch the uploaded model file: this edit is undoable,
 * so deleting the asset here would let Cmd+Z restore a body whose mesh 404s.
 * The server's grace-window sweep reclaims unreferenced models instead.
 */
export function removeBody(doc: AssemblyDoc, id: string): AssemblyDoc {
  const { [id]: _removed, ...remaining } = doc.bodies
  const bodies: typeof remaining = {}
  for (const [bodyId, body] of Object.entries(remaining)) {
    bodies[bodyId] =
      body.parent.kind === "body" && body.parent.bodyId === id
        ? { ...body, parent: { kind: "world" } }
        : body
  }
  return { bodies, bindings: doc.bindings.filter((b) => b.bodyId !== id) }
}

/**
 * Upsert a signal binding, replacing any existing binding for the same body in
 * the same channel group (joint vs. emissive).
 */
export function setBodyBinding(doc: AssemblyDoc, binding: AssemblyBinding): AssemblyDoc {
  const group = bindingGroupOf(binding.channel)
  return {
    ...doc,
    bindings: [
      ...doc.bindings.filter(
        (b) => !(b.bodyId === binding.bodyId && bindingGroupOf(b.channel) === group),
      ),
      binding,
    ],
  }
}

export function clearBodyBinding(
  doc: AssemblyDoc,
  bodyId: string,
  group: BindingGroup,
): AssemblyDoc {
  return {
    ...doc,
    bindings: doc.bindings.filter(
      (b) => !(b.bodyId === bodyId && bindingGroupOf(b.channel) === group),
    ),
  }
}

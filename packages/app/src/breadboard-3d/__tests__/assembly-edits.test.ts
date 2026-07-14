import { describe, expect, test } from "bun:test"
import type { AssemblyBinding, AssemblyBody, AssemblyDoc } from "@dreamer/schemas"
import {
  addBody,
  clearBodyBinding,
  removeBody,
  setBodyBinding,
  updateBody,
} from "../assembly-edits"

function body(id: string, overrides: Partial<AssemblyBody> = {}): AssemblyBody {
  return {
    id,
    name: id,
    assetId: `asset-${id}`,
    uri: `/models/${id}.glb`,
    format: "glb",
    parent: { kind: "world" },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    importScale: 1,
    upAxis: "y",
    ...overrides,
  }
}

function doc(bodies: AssemblyBody[], bindings: AssemblyBinding[] = []): AssemblyDoc {
  return {
    bodies: Object.fromEntries(bodies.map((b) => [b.id, b])),
    bindings,
  }
}

function binding(
  bodyId: string,
  channel: AssemblyBinding["channel"],
  overrides: Partial<AssemblyBinding> = {},
): AssemblyBinding {
  return {
    id: `${bodyId}-${channel}`,
    componentId: "servo-1",
    signal: "angle",
    bodyId,
    channel,
    map: { scale: 1, offset: 0 },
    ...overrides,
  }
}

const jointBinding = (bodyId: string) => binding(bodyId, "rotate")
const emissiveBinding = (bodyId: string) =>
  binding(bodyId, "emissive", { componentId: "led-1", signal: "brightness" })

describe("addBody / updateBody", () => {
  test("addBody does not mutate the input document", () => {
    const before = doc([body("a")])
    const after = addBody(before, body("b"))
    expect(Object.keys(before.bodies)).toEqual(["a"])
    expect(Object.keys(after.bodies).sort()).toEqual(["a", "b"])
  })

  test("updateBody merges changes onto the existing body", () => {
    const after = updateBody(doc([body("a")]), "a", { importScale: 1000 })
    expect(after.bodies.a?.importScale).toBe(1000)
    expect(after.bodies.a?.uri).toBe("/models/a.glb")
  })

  test("updateBody on a missing id returns the document unchanged", () => {
    const before = doc([body("a")])
    expect(updateBody(before, "ghost", { importScale: 5 })).toBe(before)
  })
})

describe("removeBody", () => {
  test("removes the body", () => {
    const after = removeBody(doc([body("a"), body("b")]), "a")
    expect(Object.keys(after.bodies)).toEqual(["b"])
  })

  // A child left pointing at a deleted parent would dangle: the scene graph
  // resolves parent transforms by id, so the child would vanish or jump.
  test("reparents children of the removed body to the world", () => {
    const child = body("child", { parent: { kind: "body", bodyId: "parent" } })
    const after = removeBody(doc([body("parent"), child]), "parent")
    expect(after.bodies.child?.parent).toEqual({ kind: "world" })
  })

  test("leaves children of other bodies attached", () => {
    const child = body("child", { parent: { kind: "body", bodyId: "keep" } })
    const after = removeBody(doc([body("keep"), body("drop"), child]), "drop")
    expect(after.bodies.child?.parent).toEqual({ kind: "body", bodyId: "keep" })
  })

  test("drops bindings that referenced the removed body, keeping others", () => {
    const before = doc([body("a"), body("b")], [jointBinding("a"), jointBinding("b")])
    const after = removeBody(before, "a")
    expect(after.bindings.map((b) => b.bodyId)).toEqual(["b"])
  })

  // Regression: removeBody used to hard-delete the uploaded model file via
  // deleteProjectAsset. SET_ASSEMBLY is undoable, so Cmd+Z restored a body
  // whose mesh had already been unlinked on the server — an invisible body
  // with its source file destroyed. Reclaiming assets is the server sweep's
  // job; the edit must be a pure document change.
  test("is undoable: re-adding the removed body restores an intact reference", () => {
    const original = body("a")
    const before = doc([original])
    const after = removeBody(before, "a")
    const undone = addBody(after, original)

    expect(undone.bodies.a).toEqual(original)
    expect(undone.bodies.a?.assetId).toBe("asset-a")
    expect(undone.bodies.a?.uri).toBe("/models/a.glb")
  })

  test("does not mutate the input document", () => {
    const before = doc([body("a"), body("b")], [jointBinding("a")])
    removeBody(before, "a")
    expect(Object.keys(before.bodies).sort()).toEqual(["a", "b"])
    expect(before.bindings).toHaveLength(1)
  })
})

describe("bindings", () => {
  test("setBodyBinding replaces an existing binding on the same channel", () => {
    const before = doc([body("a")], [jointBinding("a")])
    const after = setBodyBinding(
      before,
      binding("a", "rotate", { componentId: "servo-2" }),
    )
    expect(after.bindings).toHaveLength(1)
    expect(after.bindings[0]?.componentId).toBe("servo-2")
  })

  // `rotate` and `slide` are both joint channels and a body has ONE joint
  // slot, so binding slide must evict rotate — not sit alongside it and fight
  // over the same joint.
  test("setBodyBinding evicts a rotate binding when slide is bound", () => {
    const before = doc([body("a")], [binding("a", "rotate")])
    const after = setBodyBinding(before, binding("a", "slide"))
    expect(after.bindings).toHaveLength(1)
    expect(after.bindings[0]?.channel).toBe("slide")
  })

  // Joint and emissive are independent slots: binding an LED must not evict
  // the servo binding on the same body.
  test("setBodyBinding keeps the other group's binding on the same body", () => {
    const before = doc([body("a")], [jointBinding("a")])
    const after = setBodyBinding(before, emissiveBinding("a"))
    expect(after.bindings).toHaveLength(2)
    expect(after.bindings.map((b) => b.channel).sort()).toEqual(["emissive", "rotate"])
  })

  test("setBodyBinding leaves the same channel on a different body alone", () => {
    const before = doc([body("a"), body("b")], [jointBinding("b")])
    const after = setBodyBinding(before, jointBinding("a"))
    expect(after.bindings).toHaveLength(2)
  })

  test("clearBodyBinding removes only the named group for that body", () => {
    const before = doc([body("a")], [jointBinding("a"), emissiveBinding("a")])
    const after = clearBodyBinding(before, "a", "joint")
    expect(after.bindings.map((b) => b.channel)).toEqual(["emissive"])
  })

  test("clearBodyBinding does not mutate the input document", () => {
    const before = doc([body("a")], [jointBinding("a")])
    clearBodyBinding(before, "a", "joint")
    expect(before.bindings).toHaveLength(1)
  })
})

import { describe, expect, test } from "bun:test"
import { createEmptyPhysicalScene } from "@dreamer/schemas"
import { PhysicalDocumentStore } from "../document-store"

describe("PhysicalDocumentStore", () => {
  test("hydrates once and preserves edited scene and undo history on version rerenders", () => {
    const store = new PhysicalDocumentStore()
    const scene = createEmptyPhysicalScene()
    store.open("p1", scene)
    expect(store.getState().revision).toBe(0)
    store.edit({ ...scene, fixedTimeStep: 1 / 60 })
    const edited = store.getState()
    store.open("p1", structuredClone(scene))
    expect(store.getState()).toBe(edited)
    store.undo()
    expect(store.getState().scene).toEqual(scene)
    expect(store.getState().revision).toBe(2)
    store.redo()
    expect(store.getState().scene?.fixedTimeStep).toBe(1 / 60)
    expect(store.getState().revision).toBe(3)
  })

  test("isolates documents and history by project, including a legacy empty project", () => {
    const store = new PhysicalDocumentStore()
    const scene = createEmptyPhysicalScene()
    store.open("p1")
    store.edit(scene)
    store.open("p2")
    expect(store.getState()).toEqual({ projectId: "p2", scene: null, revision: 0 })
    store.undo()
    expect(store.canUndo()).toBe(false)
    store.open("p1", null)
    expect(store.getState().scene).toEqual(scene)
    store.undo()
    expect(store.getState().scene).toBeNull()
    store.close()
    expect(store.getState().projectId).toBeNull()
    store.open("p1")
    expect(store.canRedo()).toBe(true)
  })

  test("deletion is undoable and a new edit clears redo", () => {
    const store = new PhysicalDocumentStore()
    const scene = createEmptyPhysicalScene()
    store.open("p1", scene)
    store.edit(null)
    expect(store.getState().scene).toBeNull()
    store.undo()
    expect(store.getState().scene).toEqual(scene)
    store.edit({ ...scene, fixedTimeStep: 1 / 60 })
    expect(store.canRedo()).toBe(false)
  })

  test("distinguishes an absent persisted scene from an explicit clear", () => {
    const store = new PhysicalDocumentStore()
    store.open("p1")
    expect(store.getPersistableScene()).toBeUndefined()
    const scene = createEmptyPhysicalScene()
    store.edit(scene)
    expect(store.getPersistableScene()).toEqual(scene)
    store.markSaved(scene)
    expect(store.getPersistableScene()).toBeUndefined()
    store.edit(null)
    expect(store.getPersistableScene()).toBeNull()
    store.markSaved(null)
    expect(store.getPersistableScene()).toBeUndefined()
  })

  test("detaches inputs/updaters and emits only when the snapshot changes", () => {
    const store = new PhysicalDocumentStore()
    let notifications = 0
    const unsubscribe = store.subscribe(() => { notifications++ })
    const input = createEmptyPhysicalScene()
    store.open("p1", input)
    input.gravity[1] = -1
    const original = store.getState()
    store.edit(scene => scene)
    expect(store.getState()).toBe(original)
    expect(notifications).toBe(1)
    store.edit(scene => {
      if (!scene) throw new Error("Missing scene")
      scene.gravity[1] = -2
      return scene
    })
    expect(original.scene?.gravity[1]).toBe(-9.81)
    store.undo()
    expect(store.getState().scene?.gravity[1]).toBe(-9.81)
    expect(notifications).toBe(3)
    unsubscribe()
    store.redo()
    expect(notifications).toBe(3)
  })
})

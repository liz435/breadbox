import { describe, expect, test } from "bun:test"
import { BoardSession } from "../board-session"
import { createEmptyPhysicalScene } from "@dreamer/schemas"

const board = {
  components: {},
  wires: {},
  sketchCode: "",
  customLibraries: {},
  environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
} as never

const graph = { nodes: {}, edges: {} }

describe("BoardSession", () => {
  test("saves physicalScene atomically and distinguishes omitted from deleted", () => {
    const session = new BoardSession()
    session.open("p1")
    const scene = createEmptyPhysicalScene()
    const first = session.prepareSave(board, graph, 4, scene)
    if (!first) throw new Error("Expected initial save")
    expect(first.expectedVersion).toBe(4)
    expect(Object.keys(first.payload).sort()).toEqual(["boardState", "graph", "physicalScene"])
    session.markSaved(first)
    expect(session.prepareSave(board, graph, 5, scene)).toBeNull()
    expect(session.prepareSave(board, graph, 5)).toBeNull()
    const deletion = session.prepareSave(board, graph, 5, null)
    if (!deletion) throw new Error("Expected deletion")
    expect(deletion.payload).toEqual({ physicalScene: null })
    session.markSaved(deletion)
    expect(session.prepareSave(board, graph, 6, null)).toBeNull()
  })

  test("acknowledging an in-flight save preserves newer changes in every section", () => {
    const session = new BoardSession()
    session.open("p1")
    const initial = createEmptyPhysicalScene()
    const inFlight = session.prepareSave(board, graph, 1, initial)
    if (!inFlight) throw new Error("Expected initial save")
    const nextBoard = { ...(board as unknown as Record<string, unknown>), sketchCode: "new sketch" } as never
    const nextGraph = { nodes: {}, edges: { e1: {} as never } }
    const nextScene = { ...initial, fixedTimeStep: 1 / 60 }
    session.markSaved(inFlight)
    const next = session.prepareSave(nextBoard, nextGraph, 2, nextScene)
    expect(next?.payload).toEqual({ boardState: nextBoard, graph: nextGraph, physicalScene: nextScene })
    expect(next?.expectedVersion).toBe(2)
  })

  test("retries latest physical edits after failure without resending clean sections", () => {
    const session = new BoardSession()
    session.open("p1")
    const initial = session.prepareSave(board, graph, 1, null)
    if (!initial) throw new Error("Expected initial save")
    session.markSaved(initial)
    const scene = createEmptyPhysicalScene()
    const failed = session.prepareSave(board, graph, 2, scene)
    if (!failed) throw new Error("Expected scene save")
    session.markFailed(failed)
    const newer = { ...scene, fixedTimeStep: 1 / 60 }
    expect(session.prepareSave(board, graph, 2, newer)?.payload).toEqual({ physicalScene: newer })
    // Reverting a failed edit to the acknowledged baseline needs no write.
    expect(session.prepareSave(board, graph, 2, null)).toBeNull()
  })

  test("returning to the same project rejects acknowledgements from its previous session", () => {
    const session = new BoardSession()
    session.open("p1")
    const old = session.prepareSave(board, graph, 1, null)
    if (!old) throw new Error("Expected initial save")
    session.open("p2")
    session.open("p1")
    session.markSaved(old)
    expect(session.prepareSave(board, graph, 3, null)?.payload.physicalScene).toBeNull()
    session.close()
    expect(session.prepareSave(board, graph, 3, null)).toBeNull()
  })
  test("tracks board and graph dirty halves independently", () => {
    const session = new BoardSession()
    session.open("p1")

    const first = session.prepareSave(board, graph)
    expect(first?.payload.boardState).toBe(board)
    expect(first?.payload.graph).toBe(graph)
    session.markSaved(first!)
    expect(session.prepareSave(board, graph)).toBeNull()

    const changedGraph = { nodes: { n1: {} as never }, edges: {} }
    const graphOnly = session.prepareSave(board, changedGraph)
    expect(graphOnly?.payload.boardState).toBeUndefined()
    expect(graphOnly?.payload.graph).toBe(changedGraph)
  })

  test("a failed save retries only the changed halves", () => {
    const session = new BoardSession()
    session.open("p1")
    const first = session.prepareSave(board, graph)!
    session.markSaved(first)
    const changedGraph = { nodes: { n1: {} as never }, edges: {} }
    const failed = session.prepareSave(board, changedGraph)!
    session.markFailed(failed)
    const retry = session.prepareSave(board, changedGraph)!
    expect(retry?.payload.boardState).toBeUndefined()
    expect(retry?.payload.graph).toBe(changedGraph)
  })

  test("does not let an old project save mark a new project clean", () => {
    const session = new BoardSession()
    session.open("p1")
    const oldPlan = session.prepareSave(board, graph)!
    session.open("p2")
    session.markSaved(oldPlan)

    const newPlan = session.prepareSave(board, graph)
    expect(newPlan?.projectId).toBe("p2")
  })
})

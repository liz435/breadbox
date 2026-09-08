import type { GraphNode, Edge, PhysicalScene } from "@dreamer/schemas"
import type { BoardPersistable } from "./board-slice"

export type GraphPersistable = Readonly<{
  nodes: Record<string, GraphNode>
  edges: Record<string, Edge>
}>

export type BoardSavePayload = Readonly<{
  boardState?: BoardPersistable
  graph?: GraphPersistable
  physicalScene?: PhysicalScene | null
}>

export type BoardSavePlan = Readonly<{
  projectId: string
  expectedVersion: number
  payload: BoardSavePayload
  boardHash?: string
  graphHash?: string
  physicalSceneHash?: string
  generation: number
}>

/** Coordinates document dirty state independently from the HTTP adapter. */
export class BoardSession {
  private projectId: string | null = null
  private lastSavedBoardHash = ""
  private lastSavedGraphHash = ""
  private lastSavedPhysicalSceneHash = ""
  private generation = 0

  open(projectId: string): void {
    if (this.projectId === projectId) return
    this.projectId = projectId
    this.generation++
    this.lastSavedBoardHash = ""
    this.lastSavedGraphHash = ""
    this.lastSavedPhysicalSceneHash = ""
  }

  close(): void {
    this.projectId = null
    this.generation++
    this.lastSavedBoardHash = ""
    this.lastSavedGraphHash = ""
    this.lastSavedPhysicalSceneHash = ""
  }

  getProjectId(): string | null {
    return this.projectId
  }

  prepareSave(
    board: BoardPersistable,
    graph: GraphPersistable,
    expectedVersion = 0,
    physicalScene?: PhysicalScene | null,
  ): BoardSavePlan | null {
    if (this.projectId === null) return null
    const boardHash = JSON.stringify(board)
    const graphHash = JSON.stringify(graph)
    const boardDirty = boardHash !== this.lastSavedBoardHash
    const graphDirty = graphHash !== this.lastSavedGraphHash
    const physicalSceneHash = physicalScene === undefined ? undefined : JSON.stringify(physicalScene)
    const physicalDirty = physicalSceneHash !== undefined && physicalSceneHash !== this.lastSavedPhysicalSceneHash
    if (!boardDirty && !graphDirty && !physicalDirty) return null

    return {
      projectId: this.projectId,
      expectedVersion,
      generation: this.generation,
      payload: {
        ...(boardDirty ? { boardState: board } : {}),
        ...(graphDirty ? { graph } : {}),
        ...(physicalDirty ? { physicalScene } : {}),
      },
      ...(boardDirty ? { boardHash } : {}),
      ...(graphDirty ? { graphHash } : {}),
      ...(physicalDirty ? { physicalSceneHash } : {}),
    }
  }

  markSaved(plan: BoardSavePlan): void {
    if (plan.projectId !== this.projectId || plan.generation !== this.generation) return
    if (plan.boardHash !== undefined) this.lastSavedBoardHash = plan.boardHash
    if (plan.graphHash !== undefined) this.lastSavedGraphHash = plan.graphHash
    if (plan.physicalSceneHash !== undefined) this.lastSavedPhysicalSceneHash = plan.physicalSceneHash
  }

  markFailed(plan: BoardSavePlan): void {
    // prepareSave does not mark anything clean. Failed requests leave the
    // acknowledged baseline intact, including edits reverted during a request.
    void plan
  }
}

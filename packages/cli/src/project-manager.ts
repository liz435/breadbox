import { projectRepo } from "@dreamer/api/db/adapters/file/project-repo"
import { boardTracker } from "@dreamer/api/db/board-state-tracker"
import { CLI_LOCAL_USER_ID } from "@dreamer/api/supabase/env"
import type { ProjectFile } from "@dreamer/schemas"

// CLI is single-tenant; every project it reads or writes is owned by the
// canonical local user — CLI_LOCAL_USER_ID, the SAME id the auth middleware
// hands out and the ownership migration stamps onto local projects. (The
// legacy "local" literal is rewritten to this UUID on boot, so hardcoding it
// here hid app-created projects from the CLI + MCP.) Kept in one place so a
// future multi-user CLI can replace it without grepping the whole package.
const LOCAL_OWNER_ID = CLI_LOCAL_USER_ID

export type ProjectState = {
  projectId: string
  project: ProjectFile
  sceneId: string
}

export class AmbiguousSceneError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly sceneIds: string[],
  ) {
    super(
      `Project ${projectId} has ${sceneIds.length} scenes; pass --scene <id> to pick one. Available: ${sceneIds.join(", ")}`,
    )
    this.name = "AmbiguousSceneError"
  }
}

function resolveSceneId(project: ProjectFile, requestedSceneId: string | null | undefined): string {
  const sceneIds = Object.keys(project.scenes)
  if (sceneIds.length === 0) {
    throw new Error(`Project ${project.project.id} has no scenes`)
  }
  if (requestedSceneId) {
    if (!project.scenes[requestedSceneId]) {
      throw new Error(`Scene ${requestedSceneId} not found in project ${project.project.id}`)
    }
    return requestedSceneId
  }
  if (sceneIds.length > 1) {
    throw new AmbiguousSceneError(project.project.id, sceneIds)
  }
  return sceneIds[0]
}

export async function createProject(name?: string): Promise<ProjectState> {
  const project = await projectRepo.createProject({
    ownerId: LOCAL_OWNER_ID,
    name: name ?? "CLI Project",
  })
  const sceneId = resolveSceneId(project, null)
  if (project.boardState) {
    boardTracker.set(project.project.id, project.boardState)
  }
  return { projectId: project.project.id, project, sceneId }
}

export async function loadProject(
  id: string,
  sceneId?: string | null,
): Promise<ProjectState | null> {
  const project = await projectRepo.readProject(id, LOCAL_OWNER_ID)
  if (!project) return null
  const resolvedSceneId = resolveSceneId(project, sceneId)
  if (project.boardState) {
    boardTracker.set(project.project.id, project.boardState)
  }
  return { projectId: project.project.id, project, sceneId: resolvedSceneId }
}

export function listScenes(project: ProjectFile): void {
  const sceneIds = Object.keys(project.scenes)
  if (sceneIds.length === 0) {
    console.log("  No scenes.")
    return
  }
  console.log()
  console.log(`  \x1b[1mScenes (${sceneIds.length})\x1b[0m`)
  for (const id of sceneIds) {
    const scene = project.scenes[id]
    const name = scene?.name ?? "(unnamed)"
    console.log(`    \x1b[36m${id}\x1b[0m  ${name}`)
  }
  console.log()
}

export async function listProjects(): Promise<void> {
  const summaries = await projectRepo.listProjects(LOCAL_OWNER_ID)
  if (summaries.length === 0) {
    console.log("  No projects found.")
    return
  }
  console.log()
  for (const s of summaries) {
    const date = new Date(s.updatedAt).toLocaleDateString()
    const content = s.hasContent ? "" : " (empty)"
    console.log(`  \x1b[36m${s.id}\x1b[0m  ${s.name}${content}  \x1b[2m${date}\x1b[0m`)
  }
  console.log()
}

export function printBoardSummary(project: ProjectFile): void {
  const board = project.boardState
  if (!board) {
    console.log("  No board state.")
    return
  }
  const components = Object.values(board.components).filter(
    (c) => c.type !== "arduino_uno",
  )
  const wires = Object.values(board.wires)
  const sketchLines = (board.sketchCode ?? "").split("\n").filter((l) => l.trim()).length

  console.log()
  console.log(`  \x1b[1mBoard Summary\x1b[0m`)
  console.log(`  Components: ${components.length}`)
  for (const c of components) {
    console.log(`    \x1b[33m${c.type}\x1b[0m  ${c.name}  (row ${c.y}, col ${c.x})`)
  }
  console.log(`  Wires: ${wires.length}`)
  console.log(`  Sketch: ${sketchLines} lines`)
  console.log()
}

export function printSketch(project: ProjectFile): void {
  const code = project.boardState?.sketchCode
  if (!code || code.trim() === "") {
    console.log("  No sketch code.")
    return
  }
  console.log()
  const lines = code.split("\n")
  for (let i = 0; i < lines.length; i++) {
    console.log(`  \x1b[2m${String(i + 1).padStart(3)}\x1b[0m  ${lines[i]}`)
  }
  console.log()
}

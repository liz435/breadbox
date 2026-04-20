// Pure handler functions backing every MCP tool. Kept free of MCP-transport
// concerns so unit tests exercise them directly — see __tests__/handlers.test.ts.
//
// Each handler returns a plain object; the MCP tool registration layer
// (tools.ts) serialises into the protocol's {content: [...]} envelope.

import {
  boardStateToDiagram,
  diagramToBoardState,
  validateDiagram,
  withDiagramSchemaVersion,
  type DiagramIssue,
  type DiagramToolInput,
  type DiagramWire,
  type DreamerDiagram,
} from "@dreamer/schemas"
import { projectRepo } from "@dreamer/api/db/project-repo"
import { analyzePowerBudget } from "@dreamer/api/electrical/power-budget-analyzer"
import { validateSketch } from "@dreamer/api/utils/sketch-validator"
import { WIRING_GUIDE_TEXT } from "@dreamer/api/agents/core/wiring-guide-text"
import {
  LOCAL_OWNER_ID,
  NoProjectSelectedError,
  ProjectNotFoundError,
  type McpSession,
} from "./context"

// ── Helpers ─────────────────────────────────────────────────────────────

function requireProjectId(session: McpSession): string {
  if (!session.currentProjectId) throw new NoProjectSelectedError()
  return session.currentProjectId
}

async function loadDiagram(session: McpSession): Promise<{
  projectId: string
  diagram: DreamerDiagram
  sketchCode: string
}> {
  const projectId = requireProjectId(session)
  const project = await projectRepo.readProject(projectId, LOCAL_OWNER_ID)
  if (!project) throw new ProjectNotFoundError(projectId)
  const board = project.boardState
  const diagram: DreamerDiagram = board
    ? boardStateToDiagram(board)
    : {
        $schema: "dreamer-diagram-v1",
        board: "arduino_uno",
        sketch: "",
        components: [],
        wires: [],
        customLibraries: [],
        environment: { obstacles: [], boundaryEnabled: false, boundaryMargin: 100 },
      }
  return { projectId, diagram, sketchCode: board?.sketchCode ?? "" }
}

function firstSceneId(sceneIds: string[]): string {
  if (sceneIds.length === 0) throw new Error("Project has no scenes")
  return sceneIds[0]
}

// ── Project selection ──────────────────────────────────────────────────

export async function listProjects() {
  const summaries = await projectRepo.listProjects(LOCAL_OWNER_ID)
  return {
    projects: summaries.map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      hasContent: s.hasContent,
    })),
  }
}

export async function setCurrentProject(
  session: McpSession,
  input: { projectId: string },
) {
  const project = await projectRepo.readProject(input.projectId, LOCAL_OWNER_ID)
  if (!project) throw new ProjectNotFoundError(input.projectId)
  session.currentProjectId = input.projectId
  return {
    ok: true,
    projectId: input.projectId,
    name: project.project.name,
  }
}

export function getCurrentProject(session: McpSession) {
  return { projectId: session.currentProjectId }
}

// ── Reads ──────────────────────────────────────────────────────────────

export async function getBoardState(session: McpSession) {
  const { diagram } = await loadDiagram(session)
  return diagram
}

export async function listComponents(session: McpSession) {
  const { diagram } = await loadDiagram(session)
  return { components: diagram.components }
}

export async function listWires(session: McpSession) {
  const { diagram } = await loadDiagram(session)
  return { wires: diagram.wires as DiagramWire[] }
}

export async function getSketchCode(session: McpSession) {
  const { sketchCode } = await loadDiagram(session)
  return { sketch: sketchCode }
}

export async function getComponentDetails(
  session: McpSession,
  input: { componentId: string },
) {
  const { diagram } = await loadDiagram(session)
  const component = diagram.components.find((c) => c.id === input.componentId)
  if (!component) {
    return {
      error: `Component not found: ${input.componentId}`,
      availableIds: diagram.components.map((c) => c.id),
    }
  }
  return component
}

export async function analyzePowerBudgetHandler(session: McpSession) {
  const projectId = requireProjectId(session)
  const project = await projectRepo.readProject(projectId, LOCAL_OWNER_ID)
  if (!project) throw new ProjectNotFoundError(projectId)
  const board = project.boardState
  if (!board) {
    return {
      perPin: [],
      rails: [],
      issues: [],
      note: "Board is empty — no power draw to analyse.",
    }
  }
  return analyzePowerBudget(board)
}

export function getWiringGuide() {
  return { guide: WIRING_GUIDE_TEXT }
}

// ── Writes ─────────────────────────────────────────────────────────────

function formatIssues(issues: DiagramIssue[]) {
  return issues.map((i) => ({
    severity: i.severity,
    category: i.category,
    code: i.code,
    path: i.path,
    message: i.message,
    suggestion: i.suggestion ?? null,
  }))
}

export function validateDesign(input: DiagramToolInput) {
  const withSchema = withDiagramSchemaVersion(input)
  const result = validateDiagram(withSchema)
  const errors = result.issues.filter((i) => i.severity === "error")
  const warnings = result.issues.filter((i) => i.severity === "warning")
  return {
    ok: errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    issues: formatIssues(result.issues),
  }
}

export async function applyDesign(
  session: McpSession,
  input: DiagramToolInput,
) {
  const projectId = requireProjectId(session)
  const project = await projectRepo.readProject(projectId, LOCAL_OWNER_ID)
  if (!project) throw new ProjectNotFoundError(projectId)

  const withSchema = withDiagramSchemaVersion(input)
  const parse = diagramToBoardState(withSchema)
  if (!parse.ok) {
    return {
      ok: false,
      error: "Diagram conversion failed",
      issues: parse.errors.map((e) => ({
        path: e.path,
        message: e.message,
        suggestion: e.suggestion ?? null,
      })),
    }
  }

  const target = parse.boardState
  if (target.sketchCode) {
    const check = validateSketch(target.sketchCode)
    if (!check.valid) {
      return {
        ok: false,
        error: `Sketch validation failed: ${check.error}${check.line ? ` (line ${check.line})` : ""}`,
      }
    }
  }

  const sceneId = firstSceneId(Object.keys(project.scenes))
  const op = {
    opId: crypto.randomUUID(),
    projectId,
    sceneId,
    expectedVersion: project.project.version,
    timestamp: new Date().toISOString(),
    kind: "load_board" as const,
    payload: { state: target },
  }

  const applied = await projectRepo.applyBoardOps(projectId, LOCAL_OWNER_ID, {
    expectedVersion: project.project.version,
    ops: [op],
  })
  if (!applied) throw new ProjectNotFoundError(projectId)

  return {
    ok: true,
    componentCount: Object.keys(target.components).length,
    wireCount: Object.keys(target.wires).length,
    sketchBytes: target.sketchCode.length,
    boardTarget: target.boardTarget,
    newVersion: applied.newVersion,
  }
}

export async function updateSketch(
  session: McpSession,
  input: { code: string },
) {
  const projectId = requireProjectId(session)
  const project = await projectRepo.readProject(projectId, LOCAL_OWNER_ID)
  if (!project) throw new ProjectNotFoundError(projectId)

  const check = validateSketch(input.code)
  if (!check.valid) {
    return {
      ok: false,
      error: `Sketch validation failed: ${check.error}${check.line ? ` (line ${check.line})` : ""}`,
    }
  }

  const sceneId = firstSceneId(Object.keys(project.scenes))
  const op = {
    opId: crypto.randomUUID(),
    projectId,
    sceneId,
    expectedVersion: project.project.version,
    timestamp: new Date().toISOString(),
    kind: "update_sketch" as const,
    payload: { code: input.code },
  }

  const applied = await projectRepo.applyBoardOps(projectId, LOCAL_OWNER_ID, {
    expectedVersion: project.project.version,
    ops: [op],
  })
  if (!applied) throw new ProjectNotFoundError(projectId)
  return {
    ok: true,
    sketchBytes: input.code.length,
    newVersion: applied.newVersion,
  }
}

export async function patchSketch(
  session: McpSession,
  input: { startLine: number; endLine: number; newCode: string },
) {
  const projectId = requireProjectId(session)
  const project = await projectRepo.readProject(projectId, LOCAL_OWNER_ID)
  if (!project) throw new ProjectNotFoundError(projectId)
  const existing = project.boardState?.sketchCode ?? ""

  const lines = existing.split("\n")
  const { startLine, endLine, newCode } = input
  if (startLine < 1 || endLine < startLine || endLine > lines.length + 1) {
    return {
      ok: false,
      error: `Invalid line range ${startLine}-${endLine} (sketch has ${lines.length} lines)`,
    }
  }

  const replacement = newCode.split("\n")
  const patched = [
    ...lines.slice(0, startLine - 1),
    ...replacement,
    ...lines.slice(endLine),
  ].join("\n")

  const check = validateSketch(patched)
  if (!check.valid) {
    return {
      ok: false,
      error: `Sketch validation failed: ${check.error}${check.line ? ` (line ${check.line})` : ""}`,
    }
  }

  const sceneId = firstSceneId(Object.keys(project.scenes))
  const op = {
    opId: crypto.randomUUID(),
    projectId,
    sceneId,
    expectedVersion: project.project.version,
    timestamp: new Date().toISOString(),
    kind: "update_sketch" as const,
    payload: { code: patched },
  }

  const applied = await projectRepo.applyBoardOps(projectId, LOCAL_OWNER_ID, {
    expectedVersion: project.project.version,
    ops: [op],
  })
  if (!applied) throw new ProjectNotFoundError(projectId)
  return {
    ok: true,
    sketchBytes: patched.length,
    newVersion: applied.newVersion,
  }
}

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
  type CustomFootprintLookup,
  type DiagramIssue,
  type DiagramToolInput,
  type DiagramWire,
  type DreamerDiagram,
} from "@dreamer/schemas"
import { projectRepo } from "@dreamer/api/db/adapters/file/project-repo"
import { analyzePowerBudget } from "@dreamer/api/electrical/power-budget-analyzer"
import { validateSketch } from "@dreamer/api/utils/sketch-validator"
import { WIRING_GUIDE_TEXT } from "@dreamer/api/agents/core/wiring-guide-text"
import { summarizeBoardState } from "@dreamer/api/agents/core/tools/shared"
import {
  LOCAL_OWNER_ID,
  NoProjectSelectedError,
  ProjectNotFoundError,
  type McpSession,
} from "./context"
import { customComponentDslSchema, lintCustomComponentDsl, type CustomComponentDsl } from "@dreamer/schemas"
import {
  deleteCustomPart as storeDeleteCustomPart,
  getCustomPart as storeGetCustomPart,
  isValidPartId,
  listCustomParts as storeListCustomParts,
  saveCustomPart as storeSaveCustomPart,
} from "@dreamer/api/custom-parts"

// ── Helpers ─────────────────────────────────────────────────────────────

function requireProjectId(session: McpSession): string {
  if (!session.currentProjectId) throw new NoProjectSelectedError()
  return session.currentProjectId
}

// ── Per-session project cache ────────────────────────────────────────────
//
// Every read handler used to call projectRepo.readProject on the file store,
// so a single Claude Desktop reasoning step (e.g. list_components →
// get_component_details → analyze_power_budget) paid three full disk reads +
// boardState→diagram conversions. Cache the loaded ProjectFile per session
// for a short window so a burst of reads within one step reuses one load.
//
// The TTL is deliberately short: the desktop app is a SEPARATE process
// writing the same on-disk store, so a long cache would let Claude reason
// about a board the user has since edited in the app. 2s coalesces a single
// step's reads while keeping cross-process staleness negligible. Writes from
// THIS process invalidate immediately (invalidateProjectCache); a project
// switch misses via the projectId guard. Writes deliberately bypass the cache
// (they read fresh) so expectedVersion is always current.
type LoadedProject = NonNullable<Awaited<ReturnType<typeof projectRepo.readProject>>>

const PROJECT_CACHE_TTL_MS = 2000

const projectCache = new WeakMap<
  McpSession,
  { projectId: string; project: LoadedProject; loadedAtMs: number }
>()

async function readProjectCached(session: McpSession): Promise<LoadedProject> {
  const projectId = requireProjectId(session)
  const cached = projectCache.get(session)
  if (
    cached &&
    cached.projectId === projectId &&
    Date.now() - cached.loadedAtMs < PROJECT_CACHE_TTL_MS
  ) {
    return cached.project
  }
  const project = await projectRepo.readProject(projectId, LOCAL_OWNER_ID)
  if (!project) throw new ProjectNotFoundError(projectId)
  projectCache.set(session, { projectId, project, loadedAtMs: Date.now() })
  return project
}

function invalidateProjectCache(session: McpSession): void {
  projectCache.delete(session)
}

// ── Custom-part footprints ───────────────────────────────────────────────
//
// The schema-layer pin resolver is keyed only on the component type string, so
// it can't resolve `custom:*` pins by itself. Build a lookup from the DSL
// custom parts on disk (their `pins: [{name, dx, dy}]`) and hand it to the
// diagram adapter/validator, so apply_design / validate_design can wire a
// custom part by `id.pinName` — the same grid cells (row+dy, col+dx) the app
// runtime uses. Code-format parts (TS modules) have no dx/dy footprint here and
// are skipped.
async function loadCustomFootprints(): Promise<CustomFootprintLookup> {
  const map = new Map<string, Array<{ name: string; dx: number; dy: number }>>()
  for (const meta of await storeListCustomParts()) {
    if (meta.format !== "dsl") continue
    const part = await storeGetCustomPart(meta.id)
    if (!part || part.format !== "dsl") continue
    let spec: unknown
    try {
      spec = JSON.parse(part.source)
    } catch {
      continue // malformed on disk — skip rather than fail the whole call
    }
    const parsed = customComponentDslSchema.safeParse(spec)
    if (!parsed.success) continue
    map.set(
      parsed.data.type,
      parsed.data.pins.map((p) => ({ name: p.name, dx: p.dx, dy: p.dy })),
    )
  }
  return (type) => map.get(type)
}

/** True when any type in the collection is a `custom:*` part. */
function hasCustomComponent(types: Iterable<string>): boolean {
  for (const type of types) if (type.startsWith("custom:")) return true
  return false
}

async function loadDiagram(session: McpSession): Promise<{
  projectId: string
  diagram: DreamerDiagram
  sketchCode: string
}> {
  const project = await readProjectCached(session)
  const board = project.boardState
  // Only pay the custom-parts store scan when the board actually holds one, so
  // the common (no-custom) read path stays free.
  const footprints =
    board && hasCustomComponent(Object.values(board.components).map((c) => c.type))
      ? await loadCustomFootprints()
      : undefined
  const diagram: DreamerDiagram = board
    ? boardStateToDiagram(board, footprints)
    : {
        $schema: "breadbox-diagram-v1",
        board: "arduino_uno",
        sketch: "",
        components: [],
        wires: [],
        customLibraries: [],
        environment: { obstacles: [], boundaryEnabled: false, boundaryMargin: 100 },
      }
  return { projectId: project.project.id, diagram, sketchCode: board?.sketchCode ?? "" }
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
  // Drop any entry cached for the previously-selected project.
  invalidateProjectCache(session)
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

export async function getBoardOverview(session: McpSession) {
  const project = await readProjectCached(session)
  return { summary: summarizeBoardState(project) }
}

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
  const project = await readProjectCached(session)
  const board = project.boardState
  if (!board) {
    return {
      perPin: [],
      rails: [],
      issues: [],
      note: "Board is empty — no power draw to analyse.",
    }
  }
  // Resolve custom-part nets so the analyzer sees their pins (otherwise it
  // reports a wired custom part as disconnected). Guarded to skip the store
  // scan when the board has no custom parts.
  const footprints = hasCustomComponent(Object.values(board.components).map((c) => c.type))
    ? await loadCustomFootprints()
    : undefined
  return analyzePowerBudget(board, footprints)
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

export async function validateDesign(input: DiagramToolInput) {
  const withSchema = withDiagramSchemaVersion(input)
  const footprints = await loadCustomFootprints()
  const result = validateDiagram(withSchema, footprints)
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
  const footprints = await loadCustomFootprints()
  const parse = diagramToBoardState(withSchema, footprints)
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
  invalidateProjectCache(session)

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
  invalidateProjectCache(session)
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
  invalidateProjectCache(session)
  return {
    ok: true,
    sketchBytes: patched.length,
    newVersion: applied.newVersion,
  }
}

// ── Custom parts ─────────────────────────────────────────────────────────
//
// Global (per BREADBOX_HOME), not project-scoped. DSL specs are validated
// against customComponentDslSchema; saved parts appear in the palette and
// simulate like built-ins.

function partIdFromType(type: string): string {
  return type.replace(/^custom:/, "");
}

export async function listCustomParts() {
  return { parts: await storeListCustomParts() };
}

export async function getCustomPart(input: { id: string }) {
  const part = await storeGetCustomPart(input.id);
  if (!part) return { error: `Custom part "${input.id}" not found.` };
  return part;
}

type DslIssue = { path: string; message: string };

type CustomPartValidation =
  | { valid: true; id: string; warnings?: DslIssue[] }
  | { valid: false; issues: DslIssue[]; warnings?: DslIssue[] };

type ParsedCustomPart =
  | { validation: Extract<CustomPartValidation, { valid: true }>; data: CustomComponentDsl }
  | { validation: Extract<CustomPartValidation, { valid: false }>; data: null };

/**
 * Structural (zod) + semantic (lint) validation. Lint errors — unknown pin
 * refs, unparseable expressions, bindings with no svg — would produce a
 * silently dead part at runtime, so they fail validation; lint warnings
 * (missing svg id, undeclared sketch placeholder) pass through as advice.
 * Returns the parsed spec alongside the verdict so save doesn't re-parse.
 */
function parseCustomPartSpec(spec: unknown): ParsedCustomPart {
  const result = customComponentDslSchema.safeParse(spec);
  if (!result.success) {
    return {
      validation: {
        valid: false,
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      data: null,
    };
  }
  const lint = lintCustomComponentDsl(result.data);
  const errors = lint.filter((i) => i.severity === "error").map(({ path, message }) => ({ path, message }));
  const warnings = lint.filter((i) => i.severity === "warning").map(({ path, message }) => ({ path, message }));
  if (errors.length > 0) {
    return {
      validation: { valid: false, issues: errors, ...(warnings.length > 0 ? { warnings } : {}) },
      data: null,
    };
  }
  return {
    validation: {
      valid: true,
      id: partIdFromType(result.data.type),
      ...(warnings.length > 0 ? { warnings } : {}),
    },
    data: result.data,
  };
}

export function validateCustomPart(input: { spec: unknown }): CustomPartValidation {
  return parseCustomPartSpec(input.spec).validation;
}

export async function saveCustomPart(input: { spec: unknown }) {
  const parsed = parseCustomPartSpec(input.spec);
  if (!parsed.validation.valid) {
    return {
      ok: false,
      error: parsed.validation.issues.map((i) => `${i.path}: ${i.message}`).join("; "),
    };
  }
  const id = parsed.validation.id;
  if (!isValidPartId(id)) {
    return { ok: false, error: `Invalid id "${id}" — type must be custom:<kebab-name>` };
  }
  await storeSaveCustomPart(id, "dsl", JSON.stringify(parsed.data, null, 2));
  return { ok: true, id, ...(parsed.validation.warnings ? { warnings: parsed.validation.warnings } : {}) };
}

export async function deleteCustomPart(input: { id: string }) {
  return { ok: await storeDeleteCustomPart(input.id) };
}

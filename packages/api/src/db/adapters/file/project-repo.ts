import { join } from "path";
import { mkdir, readdir } from "fs/promises";
import { match } from "ts-pattern";
import { generateUniqueProjectName } from "../../../utils/name-generator";
import {
  applyOpsRequestSchema,
  assetSchema,
  type ApplyOpsRequest,
  type ProjectFile,
  type ProjectGraph,
  type SceneOp,
  projectFileSchema,
  sceneOpSchema,
  scriptComponentSchema,
  spriteComponentSchema,
  tilemapComponentSchema,
  transformComponentSchema,
  physicsBodyComponentSchema,
  cameraComponentSchema,
  applyBoardOpsRequestSchema,
  boardOpSchema,
  type ApplyBoardOpsRequest,
  type BoardOp,
} from "../../schemas";
import {
  createDefaultBoardState,
  type BoardState,
} from "@dreamer/schemas";

import { projectsDir, dreamerHome } from "../../../paths";
import { createLogger } from "../../../logger";

const log = createLogger("project-repo");

function dataDir(): string {
  return dreamerHome();
}

function now(): string {
  return new Date().toISOString();
}

function createId(): string {
  return crypto.randomUUID();
}

function projectPath(projectId: string): string {
  return join(projectsDir(), `${projectId}.json`);
}

export class VersionConflictError extends Error {
  constructor(
    readonly expectedVersion: number,
    readonly currentVersion: number
  ) {
    super(
      `Version conflict: expected ${expectedVersion}, current ${currentVersion}`
    );
    this.name = "VersionConflictError";
  }
}

export class OpValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpValidationError";
  }
}

async function ensureProjectsDir() {
  await mkdir(projectsDir(), { recursive: true });
}

// ── Raw read (no ownership filter) ───────────────────────────────────────
//
// Internal helper for code paths that must see the project before any
// ownership decision can be made (e.g. the ownership check itself, the
// migration runner, and legacy-parse fallbacks). Never exported.
async function readProjectRaw(projectId: string): Promise<ProjectFile | null> {
  const file = Bun.file(projectPath(projectId));
  if (!(await file.exists())) return null;
  const parsed = projectFileSchema.safeParse(await file.json());
  if (!parsed.success) {
    // Legacy project predating the ownerId migration, or a genuinely
    // corrupt file. Either way the public API surfaces this as "not
    // found" — the caller cannot safely act on it. The migration runner
    // that executes at boot will move these into `_legacy/` (hosted) or
    // stamp `ownerId: "local"` onto them (local), so this branch should
    // only fire for files written since boot.
    return null;
  }
  return parsed.data;
}

// ── Owner-agnostic board read (for the live board-stream watcher) ────────
//
// The board-stream poller (routes/board-stream.ts) runs server-side and must
// observe writes made by any process — notably the `dreamer mcp` server, which
// stamps ownerId "local" — regardless of the canonical owner, so it bypasses
// the ownership filter. Read-only: returns just the current version + board
// state, or null when the project (or its board) doesn't exist.
export async function readBoardStateForWatch(
  projectId: string
): Promise<{ version: number; boardState: NonNullable<ProjectFile["boardState"]> } | null> {
  const project = await readProjectRaw(projectId);
  if (!project || !project.boardState) return null;
  return { version: project.project.version, boardState: project.boardState };
}

/** Returns true iff the project is owned by `ownerId`. Logs on mismatch. */
function ownsProject(project: ProjectFile, ownerId: string): boolean {
  if (project.project.ownerId === ownerId) return true;
  // Log the projectId only — never leak which other user owns it.
  log.warn(`ownership mismatch on project ${project.project.id}`);
  return false;
}

/**
 * Strip runtime-only fields from `boardState` before they hit disk.
 *
 * Today this is just `libraryState.oled` — SSD1306 framebuffers are 1024
 * bytes per OLED that get rebuilt from scratch on every Run. Persisting
 * them would bloat project files and force project reloads to spend a
 * few hundred KB of RAM on stale pixels.
 *
 * Other runtime-only fields (servo angles, LCD text buffers) are short
 * enough that we keep them around so a saved project can show its last
 * visible state in the UI before re-running the sim. OLED is an order
 * of magnitude larger; we hold a different line for it.
 */
function stripRuntimeOnly(project: ProjectFile): ProjectFile {
  if (!project.boardState) return project;
  return {
    ...project,
    boardState: {
      ...project.boardState,
      libraryState: { ...project.boardState.libraryState, oled: {} },
    },
  };
}

async function writeProjectRaw(projectId: string, data: ProjectFile): Promise<void> {
  await ensureProjectsDir();
  const sanitised = stripRuntimeOnly(data);
  await Bun.write(projectPath(projectId), JSON.stringify(sanitised, null, 2));
}

// ── Ownership-aware public API ───────────────────────────────────────────

async function readProject(
  projectId: string,
  ownerId: string,
): Promise<ProjectFile | null> {
  const project = await readProjectRaw(projectId);
  if (!project) return null;
  if (!ownsProject(project, ownerId)) return null;
  return project;
}

async function writeProject(
  projectId: string,
  ownerId: string,
  data: ProjectFile,
): Promise<void> {
  // Guard against cross-owner writes. We trust the caller that
  // `data.project.ownerId` is the right value — this helper preserves it.
  if (data.project.ownerId !== ownerId) {
    throw new OpValidationError("ownerId mismatch on write");
  }
  await writeProjectRaw(projectId, data);
}

function buildInitialProject(params: {
  id: string;
  name: string;
  ownerId: string;
}): ProjectFile {
  const createdAt = now();
  const sceneId = createId();
  const threadId = createId();

  return {
    project: {
      id: params.id,
      name: params.name,
      ownerId: params.ownerId,
      version: 0,
      createdAt,
      updatedAt: createdAt,
      threadId,
      activeSceneId: sceneId,
    },
    scenes: {
      [sceneId]: {
        id: sceneId,
        name: "Main Scene",
        version: 0,
        settings: {
          background: "#252525",
          gravity: { x: 0, y: 9.8 },
        },
      },
    },
    entities: {},
    sceneEntityIds: {
      [sceneId]: [],
    },
    components: {
      transform: {},
      sprite: {},
      tilemap: {},
      physicsBody: {},
      script: {},
      camera: {},
    },
    assets: {},
    graph: {
      nodes: {},
      edges: {},
    },
  };
}

async function createProject(params: {
  ownerId: string;
  id?: string;
  name?: string;
}) {
  const id = params.id ?? createId();
  const existingRaw = await readProjectRaw(id);
  if (existingRaw) {
    throw new OpValidationError(`Project already exists: ${id}`);
  }

  // Generate a unique memorable name if none provided. Names are scoped
  // per-owner so two users can both have "Bold Lynx" without collision.
  let name = params.name;
  if (!name || name === "Untitled Project") {
    const allProjects = await listProjects(params.ownerId);
    const existingNames = new Set(allProjects.map((p) => p.name));
    name = generateUniqueProjectName(existingNames);
  }

  const project = buildInitialProject({ id, name, ownerId: params.ownerId });
  await writeProjectRaw(id, project);
  return project;
}

async function getOrCreateProject(params: {
  ownerId: string;
  id?: string;
  name?: string;
}) {
  if (params.id) {
    // If the project exists but belongs to a different owner, treat it as
    // "not found" and surface a create attempt — the existing-id guard in
    // createProject will then throw `already exists`, which the route
    // turns into 409. That's the correct answer: caller cannot use this
    // id, regardless of whether the cause is a name collision or a
    // cross-owner takeover attempt.
    const existing = await readProject(params.id, params.ownerId);
    if (existing) return existing;
  }
  return createProject(params);
}

function getChildrenRef(
  project: ProjectFile,
  sceneId: string,
  parentId: string | null
): string[] {
  if (parentId === null) {
    const existing = project.sceneEntityIds[sceneId];
    if (!existing) {
      project.sceneEntityIds[sceneId] = [];
    }
    return project.sceneEntityIds[sceneId]!;
  }

  const parent = project.entities[parentId];
  if (!parent) throw new OpValidationError(`Parent entity not found: ${parentId}`);
  if (parent.sceneId !== sceneId) {
    throw new OpValidationError("Parent scene mismatch");
  }
  return parent.childIds;
}

function insertAt(list: string[], value: string, index?: number) {
  if (index == null || index >= list.length) {
    list.push(value);
    return;
  }
  if (index <= 0) {
    list.unshift(value);
    return;
  }
  list.splice(index, 0, value);
}

function removeFirst(list: string[], value: string) {
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1);
}

function ensureEntity(project: ProjectFile, entityId: string) {
  const entity = project.entities[entityId];
  if (!entity) throw new OpValidationError(`Entity not found: ${entityId}`);
  return entity;
}

function assertNoCycle(project: ProjectFile, entityId: string, nextParentId: string | null) {
  if (nextParentId == null) return;
  if (nextParentId === entityId) {
    throw new OpValidationError("Cannot parent an entity to itself");
  }

  const queue = [...ensureEntity(project, entityId).childIds];
  while (queue.length > 0) {
    const childId = queue.shift()!;
    if (childId === nextParentId) {
      throw new OpValidationError("Reparent would create a cycle");
    }
    queue.push(...ensureEntity(project, childId).childIds);
  }
}

function deleteEntityCascade(project: ProjectFile, entityId: string) {
  const entity = ensureEntity(project, entityId);
  for (const childId of [...entity.childIds]) {
    deleteEntityCascade(project, childId);
  }

  const siblings = getChildrenRef(project, entity.sceneId, entity.parentId);
  removeFirst(siblings, entity.id);

  delete project.components.transform[entity.id];
  delete project.components.sprite[entity.id];
  delete project.components.tilemap[entity.id];
  delete project.components.physicsBody[entity.id];
  delete project.components.script[entity.id];
  delete project.components.camera[entity.id];
  delete project.entities[entity.id];
}

function parseComponent(componentType: string, value: unknown) {
  return match(componentType)
    .with("transform", () => transformComponentSchema.parse(value))
    .with("sprite", () => spriteComponentSchema.parse(value))
    .with("tilemap", () => tilemapComponentSchema.parse(value))
    .with("physicsBody", () => physicsBodyComponentSchema.parse(value))
    .with("script", () => scriptComponentSchema.parse(value))
    .with("camera", () => cameraComponentSchema.parse(value))
    .otherwise(() => {
      throw new OpValidationError(`Unsupported component type: ${componentType}`);
    });
}

function getComponentStore(project: ProjectFile, componentType: string) {
  return match(componentType)
    .with("transform", () => project.components.transform)
    .with("sprite", () => project.components.sprite)
    .with("tilemap", () => project.components.tilemap)
    .with("physicsBody", () => project.components.physicsBody)
    .with("script", () => project.components.script)
    .with("camera", () => project.components.camera)
    .otherwise(() => {
      throw new OpValidationError(`Unsupported component type: ${componentType}`);
    });
}

function applyOne(project: ProjectFile, op: SceneOp) {
  if (op.projectId !== project.project.id) {
    throw new OpValidationError("Op projectId does not match target project");
  }
  if (!project.scenes[op.sceneId]) {
    throw new OpValidationError(`Scene not found: ${op.sceneId}`);
  }

  return match(op)
    .with({ kind: "create_entity" }, (op) => {
      const { entity, index } = op.payload;
      if (project.entities[entity.id]) {
        throw new OpValidationError(`Duplicate entity id: ${entity.id}`);
      }
      if (entity.sceneId !== op.sceneId) {
        throw new OpValidationError("Entity sceneId must match op.sceneId");
      }
      if (entity.parentId) {
        const parent = ensureEntity(project, entity.parentId);
        if (parent.sceneId !== entity.sceneId) {
          throw new OpValidationError("Cannot parent across scenes");
        }
      }
      project.entities[entity.id] = entity;
      const children = getChildrenRef(project, entity.sceneId, entity.parentId);
      insertAt(children, entity.id, index);
      return op.sceneId;
    })
    .with({ kind: "delete_entity" }, (op) => {
      const entity = ensureEntity(project, op.payload.entityId);
      if (!op.payload.cascade && entity.childIds.length > 0) {
        throw new OpValidationError("delete_entity requires cascade for parent nodes");
      }
      deleteEntityCascade(project, op.payload.entityId);
      return op.sceneId;
    })
    .with({ kind: "reparent_entity" }, (op) => {
      const entity = ensureEntity(project, op.payload.entityId);
      if (entity.sceneId !== op.sceneId) {
        throw new OpValidationError("Entity sceneId must match op.sceneId");
      }
      if (op.payload.nextParentId) {
        const nextParent = ensureEntity(project, op.payload.nextParentId);
        if (nextParent.sceneId !== entity.sceneId) {
          throw new OpValidationError("Cannot parent across scenes");
        }
      }
      assertNoCycle(project, entity.id, op.payload.nextParentId);

      const prevChildren = getChildrenRef(project, entity.sceneId, entity.parentId);
      removeFirst(prevChildren, entity.id);

      const nextChildren = getChildrenRef(
        project,
        entity.sceneId,
        op.payload.nextParentId
      );
      insertAt(nextChildren, entity.id, op.payload.index);
      entity.parentId = op.payload.nextParentId;
      return op.sceneId;
    })
    .with({ kind: "reorder_children" }, (op) => {
      const targetChildren = getChildrenRef(
        project,
        op.sceneId,
        op.payload.parentId
      );
      const currentSet = new Set(targetChildren);
      const nextSet = new Set(op.payload.childIds);
      if (currentSet.size !== nextSet.size) {
        throw new OpValidationError("reorder_children must provide all children");
      }
      for (const childId of currentSet) {
        if (!nextSet.has(childId)) {
          throw new OpValidationError("reorder_children childIds mismatch");
        }
      }
      targetChildren.splice(0, targetChildren.length, ...op.payload.childIds);
      return op.sceneId;
    })
    .with({ kind: "update_transform" }, (op) => {
      ensureEntity(project, op.payload.entityId);
      const existing = project.components.transform[op.payload.entityId];
      if (!existing) {
        throw new OpValidationError("Transform component missing on target entity");
      }
      project.components.transform[op.payload.entityId] = {
        ...existing,
        ...op.payload.patch,
      };
      return op.sceneId;
    })
    .with({ kind: "add_component" }, (op) => {
      ensureEntity(project, op.payload.entityId);
      const parsed = parseComponent(op.payload.componentType, op.payload.value);
      if (parsed.entityId !== op.payload.entityId) {
        throw new OpValidationError("Component entityId must match payload.entityId");
      }
      const store = getComponentStore(project, op.payload.componentType);
      store[op.payload.entityId] = parsed;
      return op.sceneId;
    })
    .with({ kind: "update_component" }, (op) => {
      ensureEntity(project, op.payload.entityId);
      const store = getComponentStore(project, op.payload.componentType);
      const existing = store[op.payload.entityId];
      if (!existing) {
        throw new OpValidationError("Cannot update missing component");
      }
      const next = parseComponent(op.payload.componentType, {
        ...existing,
        ...op.payload.patch,
      });
      if (next.entityId !== op.payload.entityId) {
        throw new OpValidationError("Component entityId is immutable");
      }
      store[op.payload.entityId] = next;
      return op.sceneId;
    })
    .with({ kind: "remove_component" }, (op) => {
      ensureEntity(project, op.payload.entityId);
      const store = getComponentStore(project, op.payload.componentType);
      delete store[op.payload.entityId];
      return op.sceneId;
    })
    .with({ kind: "create_asset" }, (op) => {
      const asset = assetSchema.parse(op.payload.asset);
      if (asset.projectId !== project.project.id) {
        throw new OpValidationError("Asset projectId mismatch");
      }
      if (project.assets[asset.id]) {
        throw new OpValidationError(`Duplicate asset id: ${asset.id}`);
      }
      project.assets[asset.id] = asset;
      return op.sceneId;
    })
    .with({ kind: "update_scene_settings" }, (op) => {
      const scene = project.scenes[op.sceneId]!;
      scene.settings = {
        ...scene.settings,
        ...op.payload.patch,
        gravity: op.payload.patch.gravity ?? scene.settings.gravity,
      };
      return op.sceneId;
    })
    .with({ kind: "patch_script" }, (op) => {
      ensureEntity(project, op.payload.entityId);
      const scriptAsset = project.assets[op.payload.scriptId];
      if (!scriptAsset) {
        throw new OpValidationError(`Script asset not found: ${op.payload.scriptId}`);
      }
      if (scriptAsset.type !== "script") {
        throw new OpValidationError("patch_script requires a script asset");
      }
      scriptAsset.meta = {
        ...scriptAsset.meta,
        ...op.payload.patch,
      };
      return op.sceneId;
    })
    .exhaustive();
}

async function applyOps(projectId: string, ownerId: string, req: ApplyOpsRequest) {
  const input = applyOpsRequestSchema.parse(req);
  const existing = await readProject(projectId, ownerId);
  if (!existing) return null;

  if (existing.project.version !== input.expectedVersion) {
    throw new VersionConflictError(input.expectedVersion, existing.project.version);
  }

  const working = structuredClone(existing);
  const touchedScenes = new Set<string>();

  for (const rawOp of input.ops) {
    const op = sceneOpSchema.parse(rawOp);
    if (op.expectedVersion !== input.expectedVersion) {
      throw new OpValidationError(
        `Op ${op.opId} expectedVersion must equal batch expectedVersion`
      );
    }
    const touchedSceneId = applyOne(working, op);
    touchedScenes.add(touchedSceneId);
  }

  working.project.version += 1;
  working.project.updatedAt = now();
  for (const sceneId of touchedScenes) {
    working.scenes[sceneId]!.version += 1;
  }

  await writeProjectRaw(projectId, working);
  return {
    project: working,
    newVersion: working.project.version,
    appliedOps: input.ops,
  };
}

// ── Apply board ops ─────────────────────────────────────────────────────────

function applyBoardOp(project: ProjectFile, op: BoardOp): void {
  if (!project.boardState) {
    project.boardState = createDefaultBoardState();
  }
  const board = project.boardState!;

  switch (op.kind) {
    case "place_component":
      board.components[op.payload.component.id] = op.payload.component;
      break;
    case "remove_component":
      delete board.components[op.payload.componentId];
      break;
    case "move_component":
      if (board.components[op.payload.componentId]) {
        board.components[op.payload.componentId].x = op.payload.x;
        board.components[op.payload.componentId].y = op.payload.y;
      }
      break;
    case "update_component":
      if (board.components[op.payload.componentId]) {
        Object.assign(board.components[op.payload.componentId], op.payload.changes);
      }
      break;
    case "connect_wire":
      board.wires[op.payload.wire.id] = op.payload.wire;
      break;
    case "remove_wire":
      delete board.wires[op.payload.wireId];
      break;
    case "set_pin_mode":
      // Pin mode is runtime state on the client. The op is still persisted
      // in the project file (for eval/replay) but doesn't mutate board state.
      break;
    case "update_sketch":
      board.sketchCode = op.payload.code;
      break;
    case "update_board_settings":
      // Merge settings into board state at top level
      break;
    case "load_board":
      project.boardState = structuredClone(op.payload.state);
      break;
  }
}

async function applyBoardOps(
  projectId: string,
  ownerId: string,
  req: ApplyBoardOpsRequest,
) {
  const input = applyBoardOpsRequestSchema.parse(req);
  const existing = await readProject(projectId, ownerId);
  if (!existing) return null;

  const working = structuredClone(existing);

  for (const rawOp of input.ops) {
    const op = boardOpSchema.parse(rawOp);
    applyBoardOp(working, op);
  }

  working.project.version += 1;
  working.project.updatedAt = now();

  await writeProjectRaw(projectId, working);
  return {
    project: working,
    newVersion: working.project.version,
    appliedOps: input.ops,
  };
}

// ── List projects ───────────────────────────────────────────────────────────

type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  hasContent: boolean;
};

function projectHasContent(project: ProjectFile): boolean {
  const board = project.boardState;
  const hasBoardComponents = board
    ? Object.values(board.components).some(
        (c) => !String(c.type).startsWith("arduino_"),
      )
    : false;
  const hasBoardWires = board ? Object.keys(board.wires).length > 0 : false;
  const hasSketch = board ? board.sketchCode.trim().length > 0 : false;
  const hasGraph =
    Object.keys(project.graph?.nodes ?? {}).length > 0 ||
    Object.keys(project.graph?.edges ?? {}).length > 0;
  const hasAssets = Object.keys(project.assets ?? {}).length > 0;
  const hasEntities = Object.keys(project.entities ?? {}).length > 0;
  return hasBoardComponents || hasBoardWires || hasSketch || hasGraph || hasAssets || hasEntities;
}

async function listProjects(ownerId: string): Promise<ProjectSummary[]> {
  await ensureProjectsDir();
  const projectsRoot = projectsDir();
  const files = await readdir(projectsRoot);
  const summaries: ProjectSummary[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = await Bun.file(join(projectsRoot, file)).json();
      const parsed = projectFileSchema.safeParse(data);
      // Unparseable (legacy pre-ownerId, or corrupt) — skip. Boot-time
      // migration handles the legacy case; nothing else we can do.
      if (!parsed.success) continue;
      if (parsed.data.project.ownerId !== ownerId) continue;
      summaries.push({
        id: parsed.data.project.id,
        name: parsed.data.project.name,
        createdAt: parsed.data.project.createdAt,
        updatedAt: parsed.data.project.updatedAt,
        hasContent: projectHasContent(parsed.data),
      });
    } catch {
      // Skip files we can't even read as JSON
    }
  }

  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return summaries;
}

// ── Graph persistence ────────────────────────────────────────────────────────

async function saveGraph(
  projectId: string,
  ownerId: string,
  graph: ProjectGraph,
): Promise<{ saved: true } | null> {
  const existing = await readProject(projectId, ownerId);
  if (!existing) return null;

  existing.graph = graph;
  existing.project.updatedAt = now();
  await writeProjectRaw(projectId, existing);
  return { saved: true };
}

// ── Board state persistence ─────────────────────────────────────────────────

async function saveBoardState(
  projectId: string,
  ownerId: string,
  boardState: BoardState,
): Promise<{ saved: true } | null> {
  const existing = await readProject(projectId, ownerId);
  if (!existing) return null;

  existing.boardState = boardState;
  existing.project.updatedAt = now();
  await writeProjectRaw(projectId, existing);
  return { saved: true };
}

// ── Atomic board + graph persistence ────────────────────────────────────────
//
// Why a combined method exists:
//   The client needs to save board state and graph state together. If they
//   were saved through two separate read-mutate-write cycles, two concurrent
//   requests reading the same base snapshot would each clobber the other's
//   field on write — silently dropping half of the save.
//
//   This method reads once, applies BOTH mutations, and writes once, so the
//   on-disk file always reflects both fields atomically.
async function saveBoardAndGraph(
  projectId: string,
  ownerId: string,
  payload: { boardState?: BoardState; graph?: ProjectGraph },
): Promise<{ saved: true } | null> {
  const existing = await readProject(projectId, ownerId);
  if (!existing) return null;

  if (payload.boardState !== undefined) {
    existing.boardState = payload.boardState;
  }
  if (payload.graph !== undefined) {
    existing.graph = payload.graph;
  }
  existing.project.updatedAt = now();
  await writeProjectRaw(projectId, existing);
  return { saved: true };
}

// ── Rename project ──────────────────────────────────────────────────────────

async function renameProject(
  projectId: string,
  ownerId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const existing = await readProject(projectId, ownerId);
  if (!existing) return null;
  existing.project.name = name;
  existing.project.updatedAt = now();
  await writeProjectRaw(projectId, existing);
  return { id: projectId, name };
}

// ── Rename scene ────────────────────────────────────────────────────────────

async function renameScene(
  projectId: string,
  ownerId: string,
  sceneId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const existing = await readProject(projectId, ownerId);
  if (!existing) return null;
  const scene = existing.scenes[sceneId];
  if (!scene) return null;
  scene.name = name;
  existing.project.updatedAt = now();
  await writeProjectRaw(projectId, existing);
  return { id: sceneId, name };
}

// ── Asset directory ──────────────────────────────────────────────────────────

function assetsDir(): string {
  return join(dataDir(), "assets");
}

function projectAssetsDir(projectId: string): string {
  return join(assetsDir(), projectId);
}

async function ensureAssetsDir(
  projectId: string,
  ownerId: string,
): Promise<string | null> {
  // Ownership check: callers that hand out a filesystem directory must
  // prove the project belongs to them first, otherwise an attacker could
  // use this to seed assets on someone else's project.
  const project = await readProject(projectId, ownerId);
  if (!project) return null;
  const dir = projectAssetsDir(projectId);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ── Delete project ──────────────────────────────────────────────────────────

async function deleteProject(
  projectId: string,
  ownerId: string,
): Promise<boolean> {
  const existing = await readProject(projectId, ownerId);
  if (!existing) return false;

  const { unlink, rm } = await import("fs/promises");

  // Delete project JSON
  try {
    await unlink(projectPath(projectId));
  } catch {
    // File may already be gone
  }

  // Delete assets directory (best effort)
  const dir = projectAssetsDir(projectId);
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Directory may not exist
  }

  return true;
}

export const projectRepo = {
  listProjects,
  createProject,
  getOrCreateProject,
  readProject,
  writeProject,
  applyOps,
  applyBoardOps,
  saveGraph,
  saveBoardState,
  saveBoardAndGraph,
  renameProject,
  renameScene,
  deleteProject,
  ensureAssetsDir,
  projectAssetsDir,
};

// ── Pure helpers shared with the Supabase adapter ────────────────────────
//
// Exported so adapters/supabase/project-repo.ts can reuse the in-memory
// mutation logic without duplicating ~200 lines of op handlers. Keep
// these functions free of IO — the adapter handles persistence.

export {
  applyOne as applyOneOp,
  applyBoardOp as applyOneBoardOp,
  buildInitialProject,
  projectHasContent,
  stripRuntimeOnly,
  parseRequestApplyOps,
  parseRequestApplyBoardOps,
};

// Wrappers exposing schema parsing without leaking the schema imports.
function parseRequestApplyOps(req: unknown): ApplyOpsRequest {
  return applyOpsRequestSchema.parse(req);
}
function parseRequestApplyBoardOps(req: unknown): ApplyBoardOpsRequest {
  return applyBoardOpsRequestSchema.parse(req);
}

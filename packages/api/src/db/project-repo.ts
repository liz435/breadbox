import { join } from "path";
import { mkdir, readdir } from "fs/promises";
import { match } from "ts-pattern";
import {
  applyOpsRequestSchema,
  assetSchema,
  type ApplyOpsRequest,
  type ProjectFile,
  type SceneOp,
  projectFileSchema,
  sceneOpSchema,
  scriptComponentSchema,
  spriteComponentSchema,
  tilemapComponentSchema,
  transformComponentSchema,
  physicsBodyComponentSchema,
  cameraComponentSchema,
} from "./schemas";

const PROJECTS_DIR = join(import.meta.dir, "../../data/projects");

function now(): string {
  return new Date().toISOString();
}

function createId(): string {
  return crypto.randomUUID();
}

function projectPath(projectId: string): string {
  return join(PROJECTS_DIR, `${projectId}.json`);
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
  await mkdir(PROJECTS_DIR, { recursive: true });
}

async function readProject(projectId: string): Promise<ProjectFile | null> {
  const file = Bun.file(projectPath(projectId));
  if (!(await file.exists())) return null;
  return projectFileSchema.parse(await file.json());
}

async function writeProject(projectId: string, data: ProjectFile): Promise<void> {
  await ensureProjectsDir();
  await Bun.write(projectPath(projectId), JSON.stringify(data, null, 2));
}

function buildInitialProject(params: { id: string; name: string }): ProjectFile {
  const createdAt = now();
  const sceneId = createId();
  const threadId = createId();

  return {
    project: {
      id: params.id,
      name: params.name,
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

async function createProject(params?: { id?: string; name?: string }) {
  const id = params?.id ?? createId();
  const existing = await readProject(id);
  if (existing) {
    throw new OpValidationError(`Project already exists: ${id}`);
  }

  const project = buildInitialProject({
    id,
    name: params?.name ?? "Untitled Project",
  });
  await writeProject(id, project);
  return project;
}

async function getOrCreateProject(params?: { id?: string; name?: string }) {
  if (params?.id) {
    const existing = await readProject(params.id);
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

async function applyOps(projectId: string, req: ApplyOpsRequest) {
  const input = applyOpsRequestSchema.parse(req);
  const existing = await readProject(projectId);
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

  await writeProject(projectId, working);
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
};

async function listProjects(): Promise<ProjectSummary[]> {
  await ensureProjectsDir();
  const files = await readdir(PROJECTS_DIR);
  const summaries: ProjectSummary[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = await Bun.file(join(PROJECTS_DIR, file)).json();
      const parsed = projectFileSchema.parse(data);
      summaries.push({
        id: parsed.project.id,
        name: parsed.project.name,
        createdAt: parsed.project.createdAt,
        updatedAt: parsed.project.updatedAt,
      });
    } catch {
      // Skip corrupt files
    }
  }

  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return summaries;
}

// ── Graph persistence ────────────────────────────────────────────────────────

async function saveGraph(
  projectId: string,
  graph: { nodes: Record<string, unknown>; edges: Record<string, unknown> }
): Promise<{ saved: true } | null> {
  const existing = await readProject(projectId);
  if (!existing) return null;

  existing.graph = graph as ProjectFile["graph"];
  existing.project.updatedAt = now();
  await writeProject(projectId, existing);
  return { saved: true };
}

// ── Rename project ──────────────────────────────────────────────────────────

async function renameProject(
  projectId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const existing = await readProject(projectId);
  if (!existing) return null;
  existing.project.name = name;
  existing.project.updatedAt = now();
  await writeProject(projectId, existing);
  return { id: projectId, name };
}

// ── Asset directory ──────────────────────────────────────────────────────────

const ASSETS_DIR = join(import.meta.dir, "../../data/assets");

function projectAssetsDir(projectId: string): string {
  return join(ASSETS_DIR, projectId);
}

async function ensureAssetsDir(projectId: string): Promise<string> {
  const dir = projectAssetsDir(projectId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export const projectRepo = {
  listProjects,
  createProject,
  getOrCreateProject,
  readProject,
  writeProject,
  applyOps,
  saveGraph,
  renameProject,
  ensureAssetsDir,
  projectAssetsDir,
};

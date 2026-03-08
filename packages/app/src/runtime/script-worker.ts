/**
 * Web Worker for offloading code-node script execution from the main thread.
 *
 * Receives serialized script tasks, compiles + runs scripts in isolation,
 * and returns outputs, logs, and entity mutations.
 */

type SandboxApiData = {
  dt: number;
  time: number;
  input: Record<string, unknown>;
  state: Record<string, unknown>;
  entities: SerializedEntities;
};

type SerializedEntities = {
  /** name → { id, x, y, scaleX, scaleY, rotation, tint, visible } */
  byName: Record<string, SerializedEntity>;
  /** id → name (for reverse lookup) */
  idToName: Record<string, string>;
};

type SerializedEntity = {
  id: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  tint: string;
  visible: boolean;
};

type ScriptTask = {
  nodeId: string;
  code: string;
  api: SandboxApiData;
};

type WorkerRequest = {
  type: "exec";
  id: number;
  tasks: ScriptTask[];
  now: number;
};

type ScriptResult = {
  nodeId: string;
  outputs: Record<string, unknown>;
  logs: Array<{ nodeId: string; args: unknown[]; timestamp: number }>;
  entityMutations: Record<string, Partial<SerializedEntity>>;
  updatedState: Record<string, unknown>;
  error?: string;
};

type WorkerResponse = {
  type: "result";
  id: number;
  results: ScriptResult[];
};

// ── Script compilation cache ────────────────────────────────────────────────

type CompiledFn = (api: Record<string, unknown>) => Record<string, unknown>;
const compiledCache = new Map<string, { code: string; fn: CompiledFn }>();

function compileInWorker(code: string, nodeId: string): CompiledFn | { error: string } {
  const cached = compiledCache.get(nodeId);
  if (cached && cached.code === code) return cached.fn;

  try {
    const wrappedCode = `
      "use strict";
      return (function(__api) {
        const dt = __api.dt;
        const time = __api.time;
        const input = __api.input;
        const console = __api.console;
        const state = __api.state;
        const entities = __api.entities;
        const __output = {};

        ${code}

        if (typeof update === 'function') {
          const result = update(dt);
          if (result && typeof result === 'object') {
            Object.assign(__output, result);
          }
        }

        return __output;
      });
    `;

    // eslint-disable-next-line no-new-func
    const factory = new Function(wrappedCode);
    const fn = factory() as CompiledFn;
    compiledCache.set(nodeId, { code, fn });
    return fn;
  } catch (err) {
    return { error: `Compile error in node ${nodeId}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Entity proxy that records mutations ─────────────────────────────────────

function createEntityProxy(
  entity: SerializedEntity,
  mutations: Record<string, Partial<SerializedEntity>>,
) {
  const id = entity.id;
  // Work on a local copy so scripts see their own writes
  const local = { ...entity };
  return {
    get x() { return local.x; },
    set x(v: number) { local.x = v; if (!mutations[id]) mutations[id] = {}; mutations[id].x = v; },
    get y() { return local.y; },
    set y(v: number) { local.y = v; if (!mutations[id]) mutations[id] = {}; mutations[id].y = v; },
    get scaleX() { return local.scaleX; },
    set scaleX(v: number) { local.scaleX = v; if (!mutations[id]) mutations[id] = {}; mutations[id].scaleX = v; },
    get scaleY() { return local.scaleY; },
    set scaleY(v: number) { local.scaleY = v; if (!mutations[id]) mutations[id] = {}; mutations[id].scaleY = v; },
    get rotation() { return local.rotation; },
    set rotation(v: number) { local.rotation = v; if (!mutations[id]) mutations[id] = {}; mutations[id].rotation = v; },
    get tint() { return local.tint; },
    set tint(v: string) { local.tint = v; if (!mutations[id]) mutations[id] = {}; mutations[id].tint = v; },
    get visible() { return local.visible; },
    set visible(v: boolean) { local.visible = v; if (!mutations[id]) mutations[id] = {}; mutations[id].visible = v; },
    setPosition(x: number, y: number) {
      local.x = x; local.y = y;
      if (!mutations[id]) mutations[id] = {};
      mutations[id].x = x; mutations[id].y = y;
    },
    setScale(sx: number, sy?: number) {
      local.scaleX = sx; local.scaleY = sy ?? sx;
      if (!mutations[id]) mutations[id] = {};
      mutations[id].scaleX = sx; mutations[id].scaleY = sy ?? sx;
    },
    translate(dx: number, dy: number) {
      local.x += dx; local.y += dy;
      if (!mutations[id]) mutations[id] = {};
      mutations[id].x = local.x; mutations[id].y = local.y;
    },
  };
}

function buildEntitiesApi(
  entities: SerializedEntities,
  mutations: Record<string, Partial<SerializedEntity>>,
) {
  return {
    get(nameOrId: string) {
      const entity = entities.byName[nameOrId]
        ?? entities.byName[entities.idToName[nameOrId] ?? ""];
      if (!entity) return null;
      return createEntityProxy(entity, mutations);
    },
    list(): string[] {
      return Object.keys(entities.byName);
    },
  };
}

// ── Message handler ─────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, tasks, now } = e.data;
  const results: ScriptResult[] = [];

  for (const task of tasks) {
    const logs: Array<{ nodeId: string; args: unknown[]; timestamp: number }> = [];
    const entityMutations: Record<string, Partial<SerializedEntity>> = {};

    const compiled = compileInWorker(task.code, task.nodeId);
    if (typeof compiled === "object" && "error" in compiled) {
      results.push({
        nodeId: task.nodeId,
        outputs: {},
        logs: [{ nodeId: task.nodeId, args: [compiled.error], timestamp: now }],
        entityMutations: {},
        updatedState: task.api.state,
        error: compiled.error,
      });
      continue;
    }

    const entitiesApi = buildEntitiesApi(task.api.entities, entityMutations);

    try {
      const output = compiled({
        dt: task.api.dt,
        time: task.api.time,
        input: task.api.input,
        console: {
          log: (...args: unknown[]) => {
            logs.push({ nodeId: task.nodeId, args, timestamp: now });
          },
        },
        state: task.api.state,
        entities: entitiesApi,
      });

      results.push({
        nodeId: task.nodeId,
        outputs: typeof output === "object" && output !== null ? output : {},
        logs,
        entityMutations,
        updatedState: task.api.state,
      });
    } catch (err) {
      const errorMsg = `Runtime error in node ${task.nodeId}: ${err instanceof Error ? err.message : String(err)}`;
      logs.push({ nodeId: task.nodeId, args: [errorMsg], timestamp: now });
      results.push({
        nodeId: task.nodeId,
        outputs: {},
        logs,
        entityMutations,
        updatedState: task.api.state,
        error: errorMsg,
      });
    }
  }

  const response: WorkerResponse = { type: "result", id, results };
  self.postMessage(response);
};

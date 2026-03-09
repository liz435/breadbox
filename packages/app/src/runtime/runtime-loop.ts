import type { GraphNode, Edge } from "@dreamer/schemas";
import { evaluateGraph, evaluatePartial, getReachableSpriteIds, type NodeOutputs } from "@/graph/evaluate";
import type { SandboxLog } from "./script-sandbox";
import { frameBus } from "./frame-bus";
import { EntityStore } from "./entity-store";

// ── Types ────────────────────────────────────────────────────────────────────

export type RuntimeFrame = {
  dt: number;
  time: number;
  frameCount: number;
  logs: SandboxLog[];
};

// ── Runtime loop controller ──────────────────────────────────────────────────

export type RuntimeLoop = {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isRunning: () => boolean;
};

type RuntimeLoopParams = {
  getGraph: () => { nodes: Record<string, GraphNode>; edges: Record<string, Edge> };
  onFrame: (frame: RuntimeFrame) => void;
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

type WorkerResult = {
  nodeId: string;
  logs: Array<{ nodeId: string; args: unknown[]; timestamp: number }>;
  entityMutations: Record<string, Partial<SerializedEntity>>;
  updatedState: Record<string, unknown>;
};

export function createRuntimeLoop(params: RuntimeLoopParams): RuntimeLoop {
  const { getGraph, onFrame } = params;
  let rafId = 0;
  let running = false;
  let paused = false;
  let startTime = 0;
  let lastTime = 0;
  let frameCount = 0;
  const pressedKeys = new Set<string>();
  let hasStarted = false;
  const entityStore = new EntityStore();
  let cachedOutputs: Record<string, NodeOutputs> = {};
  const prevNodeDataHash = new Map<string, string>();

  // Web Worker for script execution
  let worker: Worker | null = null;
  let pendingWorkerResults: WorkerResult[] = [];
  let workerMessageId = 0;

  function handleKeyDown(e: KeyboardEvent) {
    pressedKeys.add(e.key);
    // Prevent arrow keys from scrolling the page during gameplay
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    pressedKeys.delete(e.key);
  }

  /** Serialize entity store for worker communication */
  function serializeEntities(nodes: Record<string, GraphNode>) {
    const byName: Record<string, SerializedEntity> = {};
    const idToName: Record<string, string> = {};

    for (const node of Object.values(nodes)) {
      if (node.type !== "sprite") continue;
      const entity = entityStore.entities.get(node.id);
      if (!entity) continue;
      byName[node.name] = { id: node.id, ...entity };
      idToName[node.id] = node.name;
    }

    return { byName, idToName };
  }

  /** Apply entity mutations from completed worker results */
  function applyWorkerResults(logs: SandboxLog[]) {
    const results = pendingWorkerResults;
    pendingWorkerResults = [];

    for (const result of results) {
      // Apply entity mutations
      for (const [entityId, mutations] of Object.entries(result.entityMutations)) {
        const entity = entityStore.entities.get(entityId);
        if (entity) {
          Object.assign(entity, mutations);
        }
      }

      // Restore node state from worker
      const existing = entityStore.nodeState.get(result.nodeId);
      if (existing) {
        Object.assign(existing, result.updatedState);
      } else {
        entityStore.nodeState.set(result.nodeId, result.updatedState);
      }

      // Collect logs
      for (const log of result.logs) {
        logs.push(log);
      }
    }
  }

  function tick(now: number) {
    if (!running || paused) return;

    const dt = lastTime === 0 ? 0.016 : (now - lastTime) / 1000;
    lastTime = now;
    frameCount++;
    const time = (now - startTime) / 1000;
    const logs: SandboxLog[] = [];

    // Apply entity mutations from previous frame's worker results
    applyWorkerResults(logs);

    const { nodes, edges } = getGraph();

    // Track which nodes are dirty this frame
    const dirtyNodeIds = new Set<string>();

    // Inject runtime data into event nodes (mutate in-place, no React state)
    for (const node of Object.values(nodes)) {
      if (node.type === "on_start") {
        Object.assign(node.data, { _triggered: !hasStarted });
        dirtyNodeIds.add(node.id);
      } else if (node.type === "on_update") {
        Object.assign(node.data, { _dt: dt });
        dirtyNodeIds.add(node.id);
      } else if (node.type === "on_input") {
        const listenKeys = Array.isArray(node.data.listenKeys)
          ? (node.data.listenKeys as string[])
          : [];
        const activeKey = listenKeys.find((k) => pressedKeys.has(k));
        Object.assign(node.data, {
          _pressed: activeKey !== undefined,
          _key: activeKey ?? "",
        });
        dirtyNodeIds.add(node.id);
      } else if (node.type === "input_map") {
        const actions = Array.isArray(node.data.actions)
          ? (node.data.actions as Array<{ name: string; keys: string[] }>)
          : [];
        const actionStates: Record<string, boolean> = {};
        for (const action of actions) {
          actionStates[action.name] = action.keys.some((k) => pressedKeys.has(k));
        }
        Object.assign(node.data, { _actionStates: actionStates });
        dirtyNodeIds.add(node.id);
      } else {
        // Detect data changes for non-event nodes (user edits during play)
        const hash = JSON.stringify(node.data);
        if (prevNodeDataHash.get(node.id) !== hash) {
          dirtyNodeIds.add(node.id);
        }
        prevNodeDataHash.set(node.id, hash);
      }
    }

    hasStarted = true;

    // Determine which sprites are reachable from output nodes
    const allowedSprites = getReachableSpriteIds(nodes, edges);

    // Sync entity store with current sprite nodes (gated by output node)
    if (frameCount === 1) {
      entityStore.init(nodes, allowedSprites);
    } else {
      entityStore.sync(nodes, allowedSprites);
    }

    // Evaluate graph — full on first frame, partial thereafter
    const evalResult = frameCount === 1
      ? evaluateGraph(nodes, edges)
      : evaluatePartial(nodes, edges, dirtyNodeIds, cachedOutputs);
    cachedOutputs = evalResult.outputs;

    // Publish to frame bus for viewport renderer
    frameBus.publish({ evalResult, nodes, time, dt, entityStore });

    // Collect script tasks and dispatch to worker
    type ScriptTask = {
      nodeId: string;
      code: string;
      api: {
        dt: number;
        time: number;
        input: Record<string, unknown>;
        state: Record<string, unknown>;
        entities: ReturnType<typeof serializeEntities>;
        pressedKeys: string[];
        selfEntityName?: string;
      };
    };

    const tasks: ScriptTask[] = [];
    const serializedEntities = serializeEntities(nodes);
    const currentPressedKeys = [...pressedKeys];

    // ── Code node scripts (graph-wired) ──
    for (const nodeId of evalResult.order) {
      const node = nodes[nodeId];
      if (!node || node.type !== "code") continue;

      const code = typeof node.data.code === "string" ? node.data.code : "";
      if (!code.trim()) continue;

      // Check if trigger input is active
      const nodeOutputs = evalResult.outputs[nodeId];
      const triggerIn = nodeOutputs?.["trigger_in"];
      if (triggerIn && triggerIn.value === false) continue;

      // Build plain input object (strip PortValue wrappers)
      const rawInput: Record<string, unknown> = {};
      const outputs = evalResult.outputs[nodeId];
      if (outputs) {
        for (const [key, pv] of Object.entries(outputs)) {
          if (pv.type === "entity" && pv.value && typeof pv.value === "object") {
            const entityNodeId = (pv.value as { nodeId: string }).nodeId;
            const entityNode = nodes[entityNodeId];
            rawInput[key] = entityNode ? entityNode.name : null;
          } else {
            rawInput[key] = pv.value;
          }
        }
      }

      tasks.push({
        nodeId,
        code,
        api: {
          dt,
          time,
          input: rawInput,
          state: entityStore.getNodeState(nodeId),
          entities: serializedEntities,
          pressedKeys: currentPressedKeys,
        },
      });
    }

    // ── Sprite inline scripts (Godot-style: script attached to entity) ──
    for (const node of Object.values(nodes)) {
      if (node.type !== "sprite") continue;
      const script = typeof node.data.script === "string" ? node.data.script : "";
      if (!script.trim()) continue;
      if (!entityStore.entities.has(node.id)) continue;

      tasks.push({
        nodeId: node.id,
        code: script,
        api: {
          dt,
          time,
          input: {},
          state: entityStore.getNodeState(node.id),
          entities: serializedEntities,
          pressedKeys: currentPressedKeys,
          selfEntityName: node.name,
        },
      });
    }

    if (tasks.length > 0 && worker) {
      workerMessageId++;
      worker.postMessage({
        type: "exec",
        id: workerMessageId,
        tasks,
        now,
      });
    }

    onFrame({ dt, time, frameCount, logs });

    rafId = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (running) return;
      running = true;
      paused = false;
      hasStarted = false;
      startTime = performance.now();
      lastTime = 0;
      frameCount = 0;
      cachedOutputs = {};
      prevNodeDataHash.clear();
      pendingWorkerResults = [];
      workerMessageId = 0;

      // Create script worker
      worker = new Worker(
        new URL("./script-worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (e) => {
        const data = e.data as { type: string; results: WorkerResult[] };
        if (data.type === "result") {
          pendingWorkerResults = data.results;
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      rafId = requestAnimationFrame(tick);
    },

    stop() {
      running = false;
      paused = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (worker) {
        worker.terminate();
        worker = null;
      }
      pendingWorkerResults = [];
      pressedKeys.clear();
      entityStore.clear();
      frameBus.clear();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    },

    pause() {
      paused = true;
    },

    resume() {
      if (!running) return;
      paused = false;
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    },

    isRunning() {
      return running && !paused;
    },
  };
}

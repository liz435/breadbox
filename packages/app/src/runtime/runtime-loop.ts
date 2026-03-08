import type { GraphNode, Edge } from "@dreamer/schemas";
import { evaluateGraph } from "@/graph/evaluate";
import { compileScript, type CompiledScript, type SandboxLog } from "./script-sandbox";
import { frameBus } from "./frame-bus";
import { EntityStore } from "./entity-store";

// ── Types ────────────────────────────────────────────────────────────────────

export type RuntimeFrame = {
  dt: number;
  time: number;
  frameCount: number;
  logs: SandboxLog[];
};

type ScriptCache = Map<string, { code: string; compiled: CompiledScript }>;

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
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void;
};

export function createRuntimeLoop(params: RuntimeLoopParams): RuntimeLoop {
  const { getGraph, onFrame, updateNodeData } = params;
  let rafId = 0;
  let running = false;
  let paused = false;
  let startTime = 0;
  let lastTime = 0;
  let frameCount = 0;
  const scriptCache: ScriptCache = new Map();
  const pressedKeys = new Set<string>();
  let hasStarted = false;
  const entityStore = new EntityStore();

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

  function tick(now: number) {
    if (!running || paused) return;

    const dt = lastTime === 0 ? 0.016 : (now - lastTime) / 1000;
    lastTime = now;
    frameCount++;
    const time = (now - startTime) / 1000;
    const logs: SandboxLog[] = [];

    const { nodes, edges } = getGraph();

    // Inject runtime data into event nodes before evaluation
    // We patch node.data directly so the evaluation sees it immediately
    // (the state machine update via updateNodeData is async and would be stale)
    for (const node of Object.values(nodes)) {
      if (node.type === "on_start") {
        const patch = { _triggered: !hasStarted };
        Object.assign(node.data, patch);
        updateNodeData(node.id, patch);
      } else if (node.type === "on_update") {
        const patch = { _dt: dt };
        Object.assign(node.data, patch);
        updateNodeData(node.id, patch);
      } else if (node.type === "on_input") {
        const listenKeys = Array.isArray(node.data.listenKeys)
          ? (node.data.listenKeys as string[])
          : [];
        const activeKey = listenKeys.find((k) => pressedKeys.has(k));
        const patch = {
          _pressed: activeKey !== undefined,
          _key: activeKey ?? "",
        };
        Object.assign(node.data, patch);
        updateNodeData(node.id, patch);
      }
    }

    hasStarted = true;

    // Sync entity store with current sprite nodes
    if (frameCount === 1) {
      entityStore.init(nodes);
    } else {
      entityStore.sync(nodes);
    }

    // Evaluate the full graph
    const evalResult = evaluateGraph(nodes, edges);

    // Build entities API for code nodes
    const entitiesApi = entityStore.buildEntitiesApi(nodes);

    // Publish to frame bus for viewport renderer
    frameBus.publish({ evalResult, nodes, time, dt, entityStore });

    // Execute code nodes with their resolved inputs
    for (const nodeId of evalResult.order) {
      const node = nodes[nodeId];
      if (!node || node.type !== "code") continue;

      const code = typeof node.data.code === "string" ? node.data.code : "";
      if (!code.trim()) continue;

      // Check if trigger input is active
      const nodeOutputs = evalResult.outputs[nodeId];
      const triggerIn = nodeOutputs?.["trigger_in"];
      if (triggerIn && triggerIn.value === false) continue;

      // Compile or use cached
      let cached = scriptCache.get(nodeId);
      if (!cached || cached.code !== code) {
        const result = compileScript(code, nodeId);
        if ("error" in result) {
          logs.push({ nodeId, args: [result.error], timestamp: now });
          continue;
        }
        cached = { code, compiled: result };
        scriptCache.set(nodeId, cached);
      }

      const scriptResult = cached.compiled.run({
        dt,
        time,
        input: evalResult.outputs[nodeId] ?? {},
        console: {
          log: (...args: unknown[]) => {
            logs.push({ nodeId, args, timestamp: now });
          },
        },
        state: entityStore.getNodeState(nodeId),
        entities: entitiesApi,
      });

      if (scriptResult.__error) {
        logs.push({
          nodeId,
          args: [scriptResult.__error],
          timestamp: now,
        });
      }
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
      scriptCache.clear();
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
      scriptCache.clear();
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

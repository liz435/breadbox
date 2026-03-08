import type { GraphNode, Edge } from "@dreamer/schemas";
import { evaluateGraph } from "@/graph/evaluate";
import { compileScript, type CompiledScript, type SandboxLog } from "./script-sandbox";

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

  function handleKeyDown(e: KeyboardEvent) {
    pressedKeys.add(e.key);
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
    for (const node of Object.values(nodes)) {
      if (node.type === "on_start") {
        updateNodeData(node.id, { _triggered: !hasStarted });
      } else if (node.type === "on_update") {
        updateNodeData(node.id, { _dt: dt });
      } else if (node.type === "on_input") {
        const listenKeys = Array.isArray(node.data.listenKeys)
          ? (node.data.listenKeys as string[])
          : [];
        const activeKey = listenKeys.find((k) => pressedKeys.has(k));
        updateNodeData(node.id, {
          _pressed: activeKey !== undefined,
          _key: activeKey ?? "",
        });
      }
    }

    hasStarted = true;

    // Evaluate the full graph
    const evalResult = evaluateGraph(nodes, edges);

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

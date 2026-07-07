// ── Transient solver worker (ROADMAP Phase B follow-up) ────────────────────
//
// Runs the SolverScheduler off the main thread. Protocol: WorkerSolverHost
// posts SolverTickRequest / SolverResetRequest; this worker answers each
// tick with a serialized analysis (SolverTickReply) or a tick-error. One
// request is in flight at a time by construction (the host coalesces), so
// no queueing logic is needed here.
//
// Loaded via `new Worker(new URL("./solver.worker.ts", import.meta.url),
// { type: "module" })` — the pattern both Vite (bundles the graph) and Bun
// (native TS workers) understand.

import { SolverScheduler } from "./solver-scheduler"
import {
  toAnalysisDto,
  type SolverWorkerReply,
  type SolverWorkerRequest,
} from "./solver-host"

const scheduler = new SolverScheduler()

// Worker global scope without pulling the "webworker" TS lib into the app
// tsconfig: structurally type the two members this file touches.
const ctx = globalThis as unknown as {
  onmessage: ((event: { data: SolverWorkerRequest }) => void) | null
  postMessage: (message: SolverWorkerReply) => void
}

ctx.onmessage = (event) => {
  const msg = event.data
  if (msg.type === "reset") {
    scheduler.reset()
    return
  }
  try {
    const tick = scheduler.tick({
      components: msg.components,
      wires: msg.wires,
      pinStates: msg.pinStates,
      shiftRegisterOutputs: msg.shiftRegisterOutputs
        ? new Map(msg.shiftRegisterOutputs)
        : undefined,
      mcuTimeSeconds: msg.mcuTimeSeconds,
    })
    ctx.postMessage({
      type: "tick-result",
      seq: msg.seq,
      analysis: toAnalysisDto(tick.analysis, tick.gridKeys),
      lagSeconds: tick.lagSeconds,
      realtimeFactor: tick.realtimeFactor,
      throttleMcu: tick.throttleMcu,
      stepsUsed: tick.stepsUsed,
    })
  } catch (err) {
    ctx.postMessage({
      type: "tick-error",
      seq: msg.seq,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

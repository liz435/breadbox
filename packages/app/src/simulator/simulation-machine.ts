// ── Simulation State Machine (XState v5) ───────────────────────────────────
//
// Manages the lifecycle of an Arduino simulation: stopped → compiling →
// running ↔ paused, with error handling.

import { setup, assign } from "xstate"

export type SimulationContext = {
  errorMessage: string | null
  tickInterval: number | null // requestAnimationFrame id
  /** Why the sim is in `paused` — distinguishes a user pause from a breakpoint. */
  pausedReason: "user" | "breakpoint" | null
}

export type SimulationEvent =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP" }
  | { type: "COMPILE_SUCCESS" }
  | { type: "COMPILE_ERROR"; message: string }
  | { type: "RUNTIME_ERROR"; message: string }
  | { type: "TICK" }
  // ── Debug control ──
  | { type: "BREAKPOINT_HIT" } // running → paused (parked at a breakpoint)
  | { type: "STEP" } // internal to paused: advanced one step, stay paused
  | { type: "CONTINUE" } // paused → running (resume free-run)

export const simulationMachine = setup({
  types: {
    context: {} as SimulationContext,
    events: {} as SimulationEvent,
  },
}).createMachine({
  id: "simulation",
  initial: "stopped",
  context: {
    errorMessage: null,
    tickInterval: null,
    pausedReason: null,
  },
  states: {
    stopped: {
      entry: assign({ errorMessage: null, tickInterval: null, pausedReason: null }),
      on: {
        PLAY: { target: "compiling" },
      },
    },
    compiling: {
      entry: assign({ errorMessage: null }),
      on: {
        COMPILE_SUCCESS: { target: "running" },
        COMPILE_ERROR: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => event.message,
          }),
        },
      },
    },
    running: {
      entry: assign({ pausedReason: null }),
      on: {
        PAUSE: { target: "paused", actions: assign({ pausedReason: "user" }) },
        BREAKPOINT_HIT: { target: "paused", actions: assign({ pausedReason: "breakpoint" }) },
        STOP: { target: "stopped" },
        RUNTIME_ERROR: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => event.message,
          }),
        },
        TICK: {}, // handled externally (keeps machine in running state)
      },
    },
    paused: {
      on: {
        RESUME: { target: "running" },
        CONTINUE: { target: "running" },
        STEP: {}, // stays paused; the loop advanced one step out-of-band
        STOP: { target: "stopped" },
      },
    },
    error: {
      on: {
        STOP: { target: "stopped" },
        PLAY: { target: "compiling" },
      },
    },
  },
})

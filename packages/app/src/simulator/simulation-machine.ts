// ── Simulation State Machine (XState v5) ───────────────────────────────────
//
// Manages the lifecycle of an Arduino simulation: stopped → compiling →
// running ↔ paused, with error handling.

import { setup, assign } from "xstate"

export type SimulationContext = {
  errorMessage: string | null
  tickInterval: number | null // requestAnimationFrame id
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
  },
  states: {
    stopped: {
      entry: assign({ errorMessage: null, tickInterval: null }),
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
      on: {
        PAUSE: { target: "paused" },
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

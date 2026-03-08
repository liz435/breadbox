import { setup, assign } from "xstate";

// ── Runtime state ────────────────────────────────────────────────────────────

export type RuntimeState = "stopped" | "playing" | "paused";

export type RuntimeContext = {
  elapsedMs: number;
  frameCount: number;
  lastFrameTs: number;
};

export type RuntimeEvent =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP" }
  | { type: "TICK"; dt: number; now: number };

export const runtimeMachine = setup({
  types: {
    context: {} as RuntimeContext,
    events: {} as RuntimeEvent,
  },
}).createMachine({
  id: "runtime",
  initial: "stopped",
  context: {
    elapsedMs: 0,
    frameCount: 0,
    lastFrameTs: 0,
  },
  states: {
    stopped: {
      on: {
        PLAY: {
          target: "playing",
          actions: assign({
            elapsedMs: 0,
            frameCount: 0,
            lastFrameTs: () => performance.now(),
          }),
        },
      },
    },
    playing: {
      on: {
        PAUSE: "paused",
        STOP: {
          target: "stopped",
          actions: assign({
            elapsedMs: 0,
            frameCount: 0,
            lastFrameTs: 0,
          }),
        },
        TICK: {
          actions: assign(({ context, event }) => ({
            elapsedMs: context.elapsedMs + event.dt,
            frameCount: context.frameCount + 1,
            lastFrameTs: event.now,
          })),
        },
      },
    },
    paused: {
      on: {
        RESUME: {
          target: "playing",
          actions: assign({
            lastFrameTs: () => performance.now(),
          }),
        },
        STOP: {
          target: "stopped",
          actions: assign({
            elapsedMs: 0,
            frameCount: 0,
            lastFrameTs: 0,
          }),
        },
      },
    },
  },
});

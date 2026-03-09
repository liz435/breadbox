import type { EvalResult } from "@/graph/evaluate";
import type { GraphNode } from "@dreamer/schemas";
import type { EntityStore } from "./entity-store";

export type FrameSnapshot = {
  evalResult: EvalResult;
  nodes: Record<string, GraphNode>;
  time: number;
  dt: number;
  entityStore: EntityStore;
};

/**
 * Shared mutable frame data bus.
 * Written by the runtime loop each tick, read by the viewport renderer.
 * No React state involved — pure imperative data sharing at 60fps.
 */
class RuntimeFrameBus {
  current: FrameSnapshot | null = null;
  playing = false;

  publish(snapshot: FrameSnapshot) {
    this.current = snapshot;
    this.playing = true;
  }

  clear() {
    this.current = null;
    this.playing = false;
  }
}

export const frameBus = new RuntimeFrameBus();

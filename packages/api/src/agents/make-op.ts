import type { SceneOp } from "../db/schemas";
import type { BoardOp } from "@dreamer/schemas";

/**
 * Context needed to stamp every op with project/scene/version metadata.
 */
export type OpContext = {
  projectId: string;
  sceneId: string;
  expectedVersion: number;
};

/**
 * Distributive Pick — preserves the discriminated union structure.
 * Standard `Pick<A | B, K>` collapses to `{ kind: "a" | "b", payload: Pa | Pb }`,
 * losing the correlation between kind and payload. This version distributes:
 * `{ kind: "a", payload: Pa } | { kind: "b", payload: Pb }`.
 */
type DistributivePick<T, K extends keyof T> = T extends unknown
  ? Pick<T, K>
  : never;

/**
 * The kind + payload portion of a SceneOp, as a discriminated union.
 * Each variant's payload is correctly paired with its kind.
 */
export type OpBody = DistributivePick<SceneOp, "kind" | "payload">;

/**
 * Type-safe factory for SceneOps. No cast needed — the discriminated union
 * `body` arg ensures kind and payload are correctly paired, and spreading
 * it into the base fields produces a valid SceneOp.
 */
export function makeOp(ctx: OpContext, body: OpBody): SceneOp {
  return {
    opId: crypto.randomUUID(),
    projectId: ctx.projectId,
    sceneId: ctx.sceneId,
    expectedVersion: ctx.expectedVersion,
    timestamp: new Date().toISOString(),
    ...body,
  };
}

/**
 * The kind + payload portion of a BoardOp, as a discriminated union.
 */
export type BoardOpBody = DistributivePick<BoardOp, "kind" | "payload">;

/**
 * Type-safe factory for BoardOps.
 */
export function makeBoardOp(ctx: OpContext, body: BoardOpBody): BoardOp {
  return {
    opId: crypto.randomUUID(),
    projectId: ctx.projectId,
    sceneId: ctx.sceneId,
    expectedVersion: ctx.expectedVersion,
    timestamp: new Date().toISOString(),
    ...body,
  } as BoardOp;
}

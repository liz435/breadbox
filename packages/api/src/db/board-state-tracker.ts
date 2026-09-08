import { isBoardComponentType, type BoardState, type BoardOp } from "@dreamer/schemas";
import { applyBoardOps, createBoardDocument } from "@dreamer/board-domain";
import { createLogger } from "../logger";

const log = createLogger("board-tracker");

/**
 * In-memory board state tracker, keyed by projectId.
 *
 * Single source of truth for current board state during the server's lifetime.
 * Updated whenever ops are applied (from agents, templates, or user edits).
 * Agents read from this instead of re-parsing the project file or relying on
 * stale system-prompt snapshots.
 */
const boards = new Map<string, BoardState>();

/** Initialize or overwrite the tracked state for a project. */
export function setBoard(projectId: string, board: BoardState): void {
  boards.set(projectId, structuredClone(board));
}

/** Get the current board state. Returns undefined if not yet tracked. */
export function getBoard(projectId: string): BoardState | undefined {
  return boards.get(projectId);
}

/**
 * Per-project async mutex. Serializes concurrent applyOps calls for the
 * same projectId so that CLI + web callers in --headed mode don't interleave
 * mid-batch. Keyed by projectId; different projects run in parallel.
 */
const locks = new Map<string, Promise<void>>();

function withLock<T>(projectId: string, fn: () => T | Promise<T>): Promise<T> {
  const prev = locks.get(projectId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Track completion only — we don't care about the returned value here.
  locks.set(
    projectId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function applyOpsInternal(
  projectId: string,
  ops: BoardOp[],
  fallbackBoard?: BoardState
): void {
  let board = boards.get(projectId);
  if (!board) {
    if (fallbackBoard) {
      board = structuredClone(fallbackBoard);
      boards.set(projectId, board);
    } else {
      log.warn(`no tracked board for project ${projectId}, skipping ops`);
      return;
    }
  }
  // The tracker is a compatibility adapter for legacy callers, so it keeps
  // expectedVersion compatibility disabled. The mutation semantics themselves
  // are shared with the browser through board-domain.
  const next = applyBoardOps(createBoardDocument(board), ops);
  boards.set(projectId, next.state);
  log.info(`applied ${ops.length} ops to project ${projectId}`);
}

/**
 * Apply a batch of ops to the tracked board state.
 * If the project isn't tracked yet, initializes from the provided fallback.
 * Serialized per-project via an async mutex — concurrent callers wait.
 *
 * Returns a Promise for new callers that want to await ordering.
 * Legacy sync callers may ignore the return value; ops are still applied
 * in arrival order due to the mutex.
 */
export function applyOps(
  projectId: string,
  ops: BoardOp[],
  fallbackBoard?: BoardState
): Promise<void> {
  return withLock(projectId, () => {
    applyOpsInternal(projectId, ops, fallbackBoard);
  });
}

/**
 * Generate a compact text summary of the current board state.
 * Used for system prompt injection so the agent has context.
 */
export function summarize(projectId: string): string {
  const board = boards.get(projectId);
  if (!board) return "Board state not available — call get_board_state.";

  const comps = Object.values(board.components);
  const wires = Object.values(board.wires);

  if (comps.length === 0 && wires.length === 0) {
    return "Board is empty — no components or wires.";
  }

  const lines: string[] = [];
  lines.push(`Components (${comps.length}):`);
  for (const c of comps) {
    if (isBoardComponentType(c.type)) continue;
    lines.push(
      `  - ${c.name} (${c.type}, id=${c.id}) at row=${c.y} col=${c.x}`
    );
  }

  if (wires.length > 0) {
    lines.push(`Wires (${wires.length}):`);
    for (const w of wires) {
      const from =
        w.fromRow === -999
          ? `Arduino pin ${w.fromCol}`
          : `row=${w.fromRow} col=${w.fromCol}`;
      lines.push(`  - ${from} → row=${w.toRow} col=${w.toCol} (${w.color})`);
    }
  }

  const sketch = board.sketchCode ?? "";
  if (sketch.length > 0) {
    lines.push(`Sketch:\n\`\`\`cpp\n${sketch}\n\`\`\``);
  }

  return lines.join("\n");
}

/** Remove a project from tracking (e.g., on project delete). */
export function removeBoard(projectId: string): void {
  boards.delete(projectId);
}

export const boardTracker = {
  set: setBoard,
  get: getBoard,
  applyOps,
  summarize,
  remove: removeBoard,
};

import type { BoardState, BoardOp } from "@dreamer/schemas";
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

/** Apply a single op to the tracked board state in-place. */
function applyOp(board: BoardState, op: BoardOp): void {
  switch (op.kind) {
    case "place_component":
      board.components[op.payload.component.id] = op.payload.component;
      break;
    case "remove_component":
      delete board.components[op.payload.componentId];
      break;
    case "move_component":
      if (board.components[op.payload.componentId]) {
        board.components[op.payload.componentId].x = op.payload.x;
        board.components[op.payload.componentId].y = op.payload.y;
      }
      break;
    case "update_component":
      if (board.components[op.payload.componentId]) {
        Object.assign(
          board.components[op.payload.componentId],
          op.payload.changes
        );
      }
      break;
    case "connect_wire":
      board.wires[op.payload.wire.id] = op.payload.wire;
      break;
    case "remove_wire":
      delete board.wires[op.payload.wireId];
      break;
    case "set_pin_mode":
      // Pin mode is runtime state on the client (owned by PinStateStore),
      // not persisted on the server-side board snapshot. This op is forwarded
      // to the client which applies it to its store directly.
      break;
    case "update_sketch":
      board.sketchCode = op.payload.code;
      break;
    case "update_board_settings":
      break;
  }
}

/**
 * Apply a batch of ops to the tracked board state.
 * If the project isn't tracked yet, initializes from the provided fallback.
 */
export function applyOps(
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
  for (const op of ops) {
    applyOp(board, op);
  }
  log.info(`applied ${ops.length} ops to project ${projectId}`);
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
    if (c.type === "arduino_uno") continue;
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

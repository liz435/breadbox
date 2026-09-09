import type { BoardOp, BoardState, LibraryState } from "@dreamer/schemas";

export {
  compileElectricalTopology,
  componentSurfaceBoardId,
  electricalTerminalKey,
  terminalAddressKey,
  LEGACY_SURFACE_BOARD_ID,
  type ElectricalGridPoint,
  type ElectricalNet,
  type ElectricalTerminal,
  type ElectricalTopology,
  type ElectricalTopologyDiagnostic,
} from "./electrical/topology";

export {
  runElectricalErc,
  compileElectricalErc,
  defaultElectricalErcTerminalSpec,
  type ElectricalErcInput,
  type ElectricalErcIssue,
  type ElectricalErcSource,
  type ElectricalErcTerminal,
} from "./electrical/erc";

export {
  AUTO_LAYOUT_ROW_GAP,
  PSU_BODY_OVERHANG_BOTTOM_ROWS,
  PSU_BODY_OVERHANG_TOP_ROWS,
  SERVO_CABLE_RUN_MM,
  SERVO_CASE_LENGTH_MM,
  SERVO_CASE_WIDTH_MM,
  SERVO_HORN_REACH_MM,
  SERVO_MOUNTING_EAR_LENGTH_MM,
  SERVO_SHAFT_FROM_TOP_MM,
  advanceAutoLayoutRow,
  component2DVisualRowBounds,
  component3DVisualRowBounds,
  componentLayoutHeight,
  componentPlacementRowBounds,
  findAutoLayoutRow,
  powerSupplyPinRows,
  visualRowBoundsOverlap,
  type PhysicalLayoutComponent,
  type VisualRowBounds,
} from "./layout/physical-layout";

/**
 * The versioned, serializable result of a board mutation.  BoardState remains
 * the wire format; the revision lives next to it so callers do not need to
 * invent their own optimistic-concurrency bookkeeping.
 */
export type BoardDocumentSnapshot = Readonly<{
  state: BoardState;
  revision: number;
}>;

export type BoardDomainErrorCode =
  | "invalid_revision"
  | "duplicate_component"
  | "missing_component"
  | "duplicate_wire"
  | "missing_wire"
  | "invalid_board_settings";

export class BoardDomainError extends Error {
  readonly code: BoardDomainErrorCode;

  constructor(code: BoardDomainErrorCode, message: string) {
    super(message);
    this.name = "BoardDomainError";
    this.code = code;
  }
}

export type ApplyBoardOptions = Readonly<{
  /**
   * Legacy callers historically sent expectedVersion=0 for every op.  Keep
   * compatibility explicit, while new persistence paths can turn this on.
   */
  enforceRevision?: boolean;
}>;

export function createBoardDocument(
  state: BoardState,
  revision = 0,
): BoardDocumentSnapshot {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new BoardDomainError("invalid_revision", `Invalid board revision: ${revision}`);
  }
  return { state: cloneBoardState(state), revision };
}

export function cloneBoardState(state: BoardState): BoardState {
  return structuredClone(state);
}

function assertRevision(
  snapshot: BoardDocumentSnapshot,
  ops: readonly BoardOp[],
  enforceRevision: boolean,
): void {
  if (!enforceRevision || ops.length === 0) return;
  const expected = ops[0].expectedVersion;
  if (ops.some((op) => op.expectedVersion !== expected)) {
    throw new BoardDomainError(
      "invalid_revision",
      "All operations in a board batch must use the same expectedVersion",
    );
  }
  if (expected !== snapshot.revision) {
    throw new BoardDomainError(
      "invalid_revision",
      `Board revision conflict: expected ${expected}, current ${snapshot.revision}`,
    );
  }
}

function applyOne(state: BoardState, op: BoardOp): void {
  switch (op.kind) {
    case "place_component": {
      const component = op.payload.component;
      if (state.components[component.id]) {
        throw new BoardDomainError(
          "duplicate_component",
          `Component already exists: ${component.id}`,
        );
      }
      state.components[component.id] = structuredClone(component);
      return;
    }
    case "remove_component": {
      const id = op.payload.componentId;
      if (!state.components[id]) {
        throw new BoardDomainError("missing_component", `Component not found: ${id}`);
      }
      delete state.components[id];
      return;
    }
    case "move_component": {
      const component = state.components[op.payload.componentId];
      if (!component) {
        throw new BoardDomainError(
          "missing_component",
          `Component not found: ${op.payload.componentId}`,
        );
      }
      component.x = op.payload.x;
      component.y = op.payload.y;
      return;
    }
    case "update_component": {
      const component = state.components[op.payload.componentId];
      if (!component) {
        throw new BoardDomainError(
          "missing_component",
          `Component not found: ${op.payload.componentId}`,
        );
      }
      Object.assign(component, structuredClone(op.payload.changes));
      return;
    }
    case "connect_wire": {
      const wire = op.payload.wire;
      if (state.wires[wire.id]) {
        throw new BoardDomainError("duplicate_wire", `Wire already exists: ${wire.id}`);
      }
      state.wires[wire.id] = structuredClone(wire);
      return;
    }
    case "remove_wire": {
      const id = op.payload.wireId;
      if (!state.wires[id]) {
        throw new BoardDomainError("missing_wire", `Wire not found: ${id}`);
      }
      delete state.wires[id];
      return;
    }
    case "set_pin_mode":
      // Pin mode is runtime-owned by PinStateStore. The operation is still
      // accepted by the document so clients can route it to that runtime.
      return;
    case "update_sketch":
      state.sketchCode = op.payload.code;
      return;
    case "update_board_settings": {
      const settings = op.payload.settings as Partial<LibraryState>;
      state.libraryState = { ...state.libraryState, ...structuredClone(settings) };
      return;
    }
    case "load_board": {
      const next = cloneBoardState(op.payload.state);
      state.components = next.components;
      state.wires = next.wires;
      state.libraryState = next.libraryState;
      state.serialOutput = next.serialOutput;
      state.sketchCode = next.sketchCode;
      state.customLibraries = next.customLibraries;
      state.boardTarget = next.boardTarget;
      state.environment = next.environment;
      state.realismProfile = next.realismProfile;
      state.assembly = next.assembly;
      return;
    }
  }
}

/**
 * Apply a batch transactionally. If one operation fails, the input snapshot
 * is untouched and no partial state is returned.
 */
export function applyBoardOps(
  snapshot: BoardDocumentSnapshot,
  ops: readonly BoardOp[],
  options: ApplyBoardOptions = {},
): BoardDocumentSnapshot {
  assertRevision(snapshot, ops, options.enforceRevision ?? false);
  const next = cloneBoardState(snapshot.state);
  for (const op of ops) applyOne(next, op);
  return {
    state: next,
    revision: ops.length > 0 ? snapshot.revision + 1 : snapshot.revision,
  };
}

export function validateBoardOps(
  snapshot: BoardDocumentSnapshot,
  ops: readonly BoardOp[],
  options: ApplyBoardOptions = {},
): void {
  applyBoardOps(snapshot, ops, options);
}

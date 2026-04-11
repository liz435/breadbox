import type { BoardOp, BoardState, Wire } from "@dreamer/schemas";
import { makeBoardOp, type OpContext } from "../agents/make-op";

export type RoutingPolicyViolationCode =
  | "PIN_DIRECT_FANOUT"
  | "GROUND_NOT_RAIL_DISTRIBUTED"
  | "POWER_NOT_RAIL_DISTRIBUTED";

export type RoutingPolicyViolation = {
  code: RoutingPolicyViolationCode;
  pin?: number;
  message: string;
};

export type RoutingPolicyAnalysis = {
  maxPinFanout: number;
  pinsOverDirectFanout: number;
  directGroundCount: number;
  directPowerCount: number;
  violations: RoutingPolicyViolation[];
};

export type RoutingNormalizationResult = {
  rewiredPins: number[];
  removedWireIds: string[];
  addedWireIds: string[];
  notes: string[];
  ops: BoardOp[];
};

const GROUND_PINS = new Set([-3, -4, -6]);
const POWER_PINS = new Set([-1, -2]);

function isGroundPin(pin: number): boolean {
  return GROUND_PINS.has(pin);
}

function isPowerPin(pin: number): boolean {
  return POWER_PINS.has(pin);
}

function isSameTerminalBus(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
  if (a.row !== b.row) return false;
  const aStrip = a.col >= 0 && a.col <= 4 ? "left" : a.col >= 5 && a.col <= 9 ? "right" : "other";
  const bStrip = b.col >= 0 && b.col <= 4 ? "left" : b.col >= 5 && b.col <= 9 ? "right" : "other";
  return aStrip !== "other" && aStrip === bStrip;
}

function keyOfWire(w: Pick<Wire, "fromRow" | "fromCol" | "toRow" | "toCol">): string {
  return `${w.fromRow}:${w.fromCol}->${w.toRow}:${w.toCol}`;
}

function hasEquivalentWire(board: BoardState, wire: Pick<Wire, "fromRow" | "fromCol" | "toRow" | "toCol">): boolean {
  const key = keyOfWire(wire);
  for (const existing of Object.values(board.wires)) {
    if (keyOfWire(existing) === key) return true;
  }
  return false;
}

function anchorRailColForPin(pin: number): number {
  if (isGroundPin(pin)) return -1;
  if (pin === -1) return -2;
  if (pin === -2) return 11;
  return -1;
}

function addWire(
  board: BoardState,
  ops: BoardOp[],
  opCtx: OpContext | undefined,
  wire: Omit<Wire, "id">,
): string | null {
  if (hasEquivalentWire(board, wire)) return null;
  const id = crypto.randomUUID();
  const next: Wire = { id, ...wire };
  board.wires[id] = next;
  if (opCtx) {
    ops.push(
      makeBoardOp(opCtx, {
        kind: "connect_wire",
        payload: { wire: next },
      }),
    );
  }
  return id;
}

function removeWire(
  board: BoardState,
  ops: BoardOp[],
  opCtx: OpContext | undefined,
  wireId: string,
) {
  if (!board.wires[wireId]) return;
  delete board.wires[wireId];
  if (opCtx) {
    ops.push(
      makeBoardOp(opCtx, {
        kind: "remove_wire",
        payload: { wireId },
      }),
    );
  }
}

export function analyzeRoutingPolicy(board: BoardState): RoutingPolicyAnalysis {
  const directByPin = new Map<number, Wire[]>();
  for (const wire of Object.values(board.wires)) {
    if (wire.fromRow !== -999) continue;
    if (!directByPin.has(wire.fromCol)) directByPin.set(wire.fromCol, []);
    directByPin.get(wire.fromCol)!.push(wire);
  }

  const violations: RoutingPolicyViolation[] = [];
  let maxPinFanout = 0;
  let pinsOverDirectFanout = 0;
  let directGroundCount = 0;
  let directPowerCount = 0;

  for (const [pin, wires] of directByPin.entries()) {
    maxPinFanout = Math.max(maxPinFanout, wires.length);
    if (isGroundPin(pin)) directGroundCount += wires.length;
    if (isPowerPin(pin)) directPowerCount += wires.length;

    if (wires.length > 1) {
      pinsOverDirectFanout++;
      violations.push({
        code: "PIN_DIRECT_FANOUT",
        pin,
        message: `Pin ${pin} has ${wires.length} direct wires. Route through a breadboard bus/rail with a single Arduino lead.`,
      });
    }
  }

  if (directGroundCount > 1) {
    violations.push({
      code: "GROUND_NOT_RAIL_DISTRIBUTED",
      message: `Ground has ${directGroundCount} direct Arduino connections. Use one Arduino GND wire to a rail, then branch from that rail.`,
    });
  }
  if (directPowerCount > 1) {
    violations.push({
      code: "POWER_NOT_RAIL_DISTRIBUTED",
      message: `Power has ${directPowerCount} direct Arduino power-pin connections. Use one Arduino power wire to a rail, then branch from that rail.`,
    });
  }

  return {
    maxPinFanout,
    pinsOverDirectFanout,
    directGroundCount,
    directPowerCount,
    violations,
  };
}

export function normalizeDirectPinFanout(params: {
  board: BoardState;
  opCtx?: OpContext;
}): RoutingNormalizationResult | null {
  const { board, opCtx } = params;
  const ops: BoardOp[] = [];
  const rewiredPins: number[] = [];
  const removedWireIds: string[] = [];
  const addedWireIds: string[] = [];
  const notes: string[] = [];

  const directByPin = new Map<number, Wire[]>();
  for (const wire of Object.values(board.wires)) {
    if (wire.fromRow !== -999) continue;
    if (!directByPin.has(wire.fromCol)) directByPin.set(wire.fromCol, []);
    directByPin.get(wire.fromCol)!.push(wire);
  }

  for (const [pin, wires] of directByPin.entries()) {
    if (wires.length <= 1) continue;
    const originals = [...wires].sort((a, b) => a.id.localeCompare(b.id));
    const first = originals[0]!;
    const sourceColor = first.color ?? "#22c55e";

    for (const w of originals) {
      removeWire(board, ops, opCtx, w.id);
      removedWireIds.push(w.id);
    }

    if (isGroundPin(pin) || isPowerPin(pin)) {
      const railCol = anchorRailColForPin(pin);
      const sourceId = addWire(board, ops, opCtx, {
        fromRow: -999,
        fromCol: pin,
        toRow: 0,
        toCol: railCol,
        color: sourceColor,
      });
      if (sourceId) addedWireIds.push(sourceId);

      for (const w of originals) {
        const from = { row: w.toRow, col: railCol };
        const to = { row: w.toRow, col: w.toCol };
        if (from.row === to.row && from.col === to.col) continue;
        const branchId = addWire(board, ops, opCtx, {
          fromRow: from.row,
          fromCol: from.col,
          toRow: to.row,
          toCol: to.col,
          color: w.color ?? sourceColor,
        });
        if (branchId) addedWireIds.push(branchId);
      }
      rewiredPins.push(pin);
      notes.push(`Routed pin ${pin} through rail column ${railCol} with one Arduino lead.`);
      continue;
    }

    const anchorCol = first.toCol <= 4 ? 0 : 5;
    const anchor = { row: first.toRow, col: anchorCol };
    const sourceId = addWire(board, ops, opCtx, {
      fromRow: -999,
      fromCol: pin,
      toRow: anchor.row,
      toCol: anchor.col,
      color: sourceColor,
    });
    if (sourceId) addedWireIds.push(sourceId);

    for (const w of originals) {
      const target = { row: w.toRow, col: w.toCol };
      if (isSameTerminalBus(anchor, target)) continue;
      const branchId = addWire(board, ops, opCtx, {
        fromRow: anchor.row,
        fromCol: anchor.col,
        toRow: target.row,
        toCol: target.col,
        color: w.color ?? sourceColor,
      });
      if (branchId) addedWireIds.push(branchId);
    }
    rewiredPins.push(pin);
    notes.push(`Routed pin ${pin} through tie row (${anchor.row}, ${anchor.col}) with one Arduino lead.`);
  }

  if (rewiredPins.length === 0) return null;
  return { rewiredPins, removedWireIds, addedWireIds, notes, ops };
}

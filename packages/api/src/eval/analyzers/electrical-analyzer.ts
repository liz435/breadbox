import type { BoardState } from "@dreamer/schemas";
import { createDefaultBoardState } from "@dreamer/schemas";
import { analyzePowerBudget } from "../../electrical/power-budget-analyzer";
import type { ElectricalAnalysis, RunFile } from "../types";

function replayBoardFromOps(run: RunFile): BoardState {
  const board = createDefaultBoardState();

  for (const op of run.proposedOps) {
    switch (op.kind) {
      case "place_component": {
        const component = op.payload.component as BoardState["components"][string];
        if (component) board.components[component.id] = component;
        break;
      }
      case "remove_component":
        delete board.components[op.payload.componentId as string];
        break;
      case "move_component": {
        const id = op.payload.componentId as string;
        const c = board.components[id];
        if (c) {
          c.x = op.payload.x as number;
          c.y = op.payload.y as number;
        }
        break;
      }
      case "update_component": {
        const id = op.payload.componentId as string;
        const c = board.components[id];
        if (c) {
          Object.assign(c, op.payload.changes as Record<string, unknown>);
        }
        break;
      }
      case "connect_wire": {
        const wire = op.payload.wire as BoardState["wires"][string];
        if (wire) board.wires[wire.id] = wire;
        break;
      }
      case "remove_wire":
        delete board.wires[op.payload.wireId as string];
        break;
      case "update_sketch":
        board.sketchCode = (op.payload.code as string) ?? "";
        break;
    }
  }

  return board;
}

export function analyzeElectrical(run: RunFile): ElectricalAnalysis {
  const hasBoardOps = run.proposedOps.some((op) =>
    [
      "place_component",
      "remove_component",
      "move_component",
      "update_component",
      "connect_wire",
      "remove_wire",
      "update_sketch",
      "update_board_settings",
    ].includes(op.kind)
  );
  if (!hasBoardOps) return null;

  const board = replayBoardFromOps(run);
  const report = analyzePowerBudget(board);

  let pinOvercurrent = 0;
  let railOvercurrent = 0;
  let missingExternalSupply = 0;
  let errors = 0;
  let warnings = 0;
  const issues: string[] = [];

  for (const issue of report.issues) {
    if (issue.severity === "error") errors++;
    if (issue.severity === "warning") warnings++;
    if (issue.code === "PIN_OVERCURRENT") pinOvercurrent++;
    if (issue.code.startsWith("RAIL_OVERCURRENT") || issue.code === "BOARD_TOTAL_OVERCURRENT") railOvercurrent++;
    if (issue.code === "EXTERNAL_POWER_REQUIRED" || issue.code === "HIGH_CURRENT_ON_ARDUINO_5V") missingExternalSupply++;
    issues.push(issue.message);
  }

  return {
    pinOvercurrent,
    railOvercurrent,
    missingExternalSupply,
    errors,
    warnings,
    issues,
  };
}


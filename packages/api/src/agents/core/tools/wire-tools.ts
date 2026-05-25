import { tool } from "ai";
import { z } from "zod";
import { makeBoardOp } from "../../make-op";
import type { ToolContext } from "./shared";
import { getComponentPinNames, resolveComponentPinTarget } from "./shared";

export function createWireTools(ctx: ToolContext) {
  const { workingBoard, ops, opCtx } = ctx;

  return {
    connect_wire: tool({
      description: "Add a wire. Arduino pin: fromRow=-999, fromCol=pin# (D13=13, A0=14, 5V=-1, GND=-3).",
      inputSchema: z.object({
        fromRow: z.number().describe("-999 for Arduino pin"),
        fromCol: z.number().describe("Pin# if fromRow=-999"),
        toRow: z.number(),
        toCol: z.number(),
        color: z.string().optional().describe("Hex color"),
      }),
      execute: async (input) => {
        const wireId = crypto.randomUUID();
        const wire = {
          id: wireId,
          fromRow: input.fromRow,
          fromCol: input.fromCol,
          toRow: input.toRow,
          toCol: input.toCol,
          color: input.color ?? "#22c55e",
        };
        ops.push(makeBoardOp(opCtx, { kind: "connect_wire", payload: { wire } }));
        workingBoard.wires[wireId] = wire;
        return { wireId };
      },
    }),

    wire_component_to_pin: tool({
      description: "Wire a specific logical component pin to an Arduino pin by component ID.",
      inputSchema: z.object({
        componentId: z.string(),
        arduinoPin: z.number().describe("Pin# (-1=5V, -3=GND, 0-19=digital/analog)"),
        componentPin: z.string().describe("Logical pin name on the component, e.g. anode/cathode, a/b, signal/vcc/gnd."),
        color: z.string().optional(),
      }),
      execute: async (input) => {
        const comp = workingBoard.components[input.componentId];
        if (!comp) {
          return { error: `Component ${input.componentId} not found.` };
        }

        const allowedPins = getComponentPinNames(comp.type);
        if (allowedPins.length === 0) {
          return { error: `Component type "${comp.type}" does not expose logical pins for wire_component_to_pin.` };
        }
        if (!allowedPins.includes(input.componentPin)) {
          return {
            error: `Invalid pin "${input.componentPin}" for ${comp.type}. Allowed: ${allowedPins.join(", ")}`,
          };
        }
        const target = resolveComponentPinTarget(comp, input.componentPin);
        if (!target) {
          return { error: `Unable to resolve pin target for ${comp.type}.${input.componentPin}` };
        }

        const wireId = crypto.randomUUID();
        const wire = {
          id: wireId,
          fromRow: -999,
          fromCol: input.arduinoPin,
          toRow: target.row,
          toCol: target.col,
          color: input.color ?? "#22c55e",
        };
        ops.push(makeBoardOp(opCtx, { kind: "connect_wire", payload: { wire } }));
        workingBoard.wires[wireId] = wire;
        return {
          wireId,
          from: `Arduino pin ${input.arduinoPin}`,
          to: `${comp.name}.${input.componentPin} at row=${target.row} col=${target.col}`,
        };
      },
    }),

    remove_wire: tool({
      description: "Remove a wire by ID.",
      inputSchema: z.object({
        wireId: z.string(),
      }),
      execute: async (input) => {
        if (!workingBoard.wires[input.wireId]) {
          return { error: `Wire ${input.wireId} not found.` };
        }
        ops.push(makeBoardOp(opCtx, { kind: "remove_wire", payload: { wireId: input.wireId } }));
        delete workingBoard.wires[input.wireId];
        return { removed: input.wireId };
      },
    }),

    update_wire: tool({
      description: "Move a wire endpoint.",
      inputSchema: z.object({
        wireId: z.string(),
        endpoint: z.enum(["from", "to"]),
        row: z.number(),
        col: z.number(),
      }),
      execute: async (input) => {
        const wire = workingBoard.wires[input.wireId];
        if (!wire) {
          return { error: `Wire ${input.wireId} not found.` };
        }

        const changes = input.endpoint === "from"
          ? { fromRow: input.row, fromCol: input.col }
          : { toRow: input.row, toCol: input.col };

        // We don't have an update_wire op kind, so remove + re-add
        ops.push(
          makeBoardOp(opCtx, {
            kind: "remove_wire",
            payload: { wireId: input.wireId },
          })
        );
        const newWireId = crypto.randomUUID();
        ops.push(
          makeBoardOp(opCtx, {
            kind: "connect_wire",
            payload: {
              wire: {
                id: newWireId,
                fromRow: changes.fromRow ?? wire.fromRow,
                fromCol: changes.fromCol ?? wire.fromCol,
                toRow: changes.toRow ?? wire.toRow,
                toCol: changes.toCol ?? wire.toCol,
                color: wire.color,
              },
            },
          })
        );

        // Update working state
        delete workingBoard.wires[input.wireId];
        workingBoard.wires[newWireId] = {
          id: newWireId,
          fromRow: changes.fromRow ?? wire.fromRow,
          fromCol: changes.fromCol ?? wire.fromCol,
          toRow: changes.toRow ?? wire.toRow,
          toCol: changes.toCol ?? wire.toCol,
          color: wire.color,
        };

        return { oldWireId: input.wireId, newWireId, endpoint: input.endpoint };
      },
    }),
  } as const;
}

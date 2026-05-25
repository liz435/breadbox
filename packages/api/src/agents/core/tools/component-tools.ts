import { tool } from "ai";
import { z } from "zod";
import { makeBoardOp } from "../../make-op";
import type { ToolContext } from "./shared";
import { ALL_COMPONENT_TYPES } from "./shared";

export function createComponentTools(ctx: ToolContext) {
  const { workingBoard, ops, opCtx } = ctx;

  return {
    place_component: tool({
      description: "Place a component on the breadboard. Set all pins to null — wiring determines connections.",
      inputSchema: z.object({
        type: z.enum(ALL_COMPONENT_TYPES),
        name: z.string().describe("Display name"),
        x: z.number().int().min(0).max(9).describe("Column (0-9)"),
        y: z.number().int().min(0).max(29).describe("Row (0-29)"),
        rotation: z.number().int().min(0).max(3).optional(),
        pins: z.record(z.string(), z.number().nullable()).describe("Pin map — set all to null"),
        properties: z.record(z.string(), z.unknown()).optional().describe("E.g. {resistance: 220, color: '#ef4444'}"),
      }),
      execute: async (input) => {
        // Check for overlap against working state (includes this turn's placements)
        const existing = Object.values(workingBoard.components);
        const overlap = existing.find(
          (c) => c.type !== "arduino_uno" && c.x === input.x && c.y === input.y,
        );
        if (overlap) {
          return {
            error: `Position (row=${input.y}, col=${input.x}) is already occupied by ${overlap.name} (${overlap.id.slice(0, 8)}). Choose a different position.`,
          };
        }

        const componentId = crypto.randomUUID();
        const component = {
          id: componentId,
          type: input.type,
          name: input.name,
          x: input.x,
          y: input.y,
          rotation: input.rotation ?? 0,
          pins: input.pins,
          properties: input.properties ?? {},
        };

        ops.push(
          makeBoardOp(opCtx, {
            kind: "place_component",
            payload: { component },
          })
        );

        // Update working state so subsequent reads see this component
        workingBoard.components[componentId] = component as typeof workingBoard.components[string];

        return { componentId, name: input.name, type: input.type };
      },
    }),

    update_component: tool({
      description: "Update a component's name, pins, or properties.",
      inputSchema: z.object({
        componentId: z.string(),
        changes: z.object({
          name: z.string().optional(),
          pins: z.record(z.string(), z.number().nullable()).optional(),
          properties: z.record(z.string(), z.unknown()).optional(),
        }),
      }),
      execute: async (input) => {
        const comp = workingBoard.components[input.componentId];
        if (!comp) {
          return { error: `Component ${input.componentId} not found.` };
        }

        ops.push(
          makeBoardOp(opCtx, {
            kind: "update_component",
            payload: {
              componentId: input.componentId,
              changes: input.changes,
            },
          })
        );

        // Update working state
        if (input.changes.name) comp.name = input.changes.name;
        if (input.changes.pins) Object.assign(comp.pins, input.changes.pins);
        if (input.changes.properties) Object.assign(comp.properties, input.changes.properties);

        return { updated: input.componentId, changes: input.changes };
      },
    }),

    move_component: tool({
      description: "Move a component to a new position.",
      inputSchema: z.object({
        componentId: z.string(),
        x: z.number().int().min(0).max(9).describe("Column"),
        y: z.number().int().min(0).max(29).describe("Row"),
      }),
      execute: async (input) => {
        const comp = workingBoard.components[input.componentId];
        if (!comp) {
          return { error: `Component ${input.componentId} not found.` };
        }

        // Check overlap at target position
        const overlap = Object.values(workingBoard.components).find(
          (c) => c.type !== "arduino_uno" && c.id !== input.componentId && c.x === input.x && c.y === input.y,
        );
        if (overlap) {
          return { error: `Position (row=${input.y}, col=${input.x}) is occupied by ${overlap.name}.` };
        }

        ops.push(
          makeBoardOp(opCtx, {
            kind: "move_component",
            payload: { componentId: input.componentId, x: input.x, y: input.y },
          })
        );

        comp.x = input.x;
        comp.y = input.y;

        return { moved: input.componentId, x: input.x, y: input.y };
      },
    }),

    remove_component: tool({
      description: "Remove a component. Returns any orphaned wires to clean up.",
      inputSchema: z.object({
        componentId: z.string(),
      }),
      execute: async (input) => {
        const comp = workingBoard.components[input.componentId];
        if (!comp) {
          return { error: `Component ${input.componentId} not found.` };
        }

        ops.push(
          makeBoardOp(opCtx, {
            kind: "remove_component",
            payload: { componentId: input.componentId },
          })
        );

        // Find orphaned wires
        const wires = Object.values(workingBoard.wires);
        const orphanedWires = wires.filter(
          (w) =>
            (w.toRow === comp.y && w.toCol === comp.x) ||
            (w.fromRow === comp.y && w.fromCol === comp.x),
        );

        delete workingBoard.components[input.componentId];

        return {
          removed: input.componentId,
          orphanedWires: orphanedWires.map((w) => ({ id: w.id, color: w.color })),
          hint: orphanedWires.length > 0
            ? `${orphanedWires.length} wire(s) may be orphaned. Consider removing them with remove_wire.`
            : undefined,
        };
      },
    }),
  } as const;
}

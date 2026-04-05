import { tool } from "ai";
import { z } from "zod";
import type { ProjectFile } from "../../db/schemas";
import type { AgentKind } from "../../db/schemas";
import type { BoardOp } from "@dreamer/schemas";
import { agentRunRepo } from "../../db/agent-run-repo";
import { makeBoardOp } from "../make-op";
import type { AgentRunner, DelegationContext } from "../types";
import { runGraphAgent } from "../graph/agent";
import { runCircuitAgent } from "../circuit/agent";

/**
 * Creates a delegation tool that spawns a specialist agent run.
 */
function makeDelegationTool(
  agentName: AgentKind,
  runner: AgentRunner,
  description: string,
  delegation: DelegationContext,
  ops: BoardOp[],
) {
  return tool({
    description,
    inputSchema: z.object({
      task: z.string().describe(`Description of the ${agentName} task to delegate`),
    }),
    execute: async (input) => {
      const log = delegation.parentLog.child(`delegate:${agentName}`);
      log.info(`delegating: ${input.task.slice(0, 100)}`);

      const childRun = await agentRunRepo.createRun({
        threadId: delegation.threadId,
        projectId: delegation.projectId,
        sceneId: delegation.sceneId,
        sessionId: delegation.sessionId,
        prompt: input.task,
        agent: agentName,
        parentRunId: delegation.parentRunId,
      });
      await agentRunRepo.attachRunToThread(delegation.threadId, childRun.run.id);

      try {
        const result = await runner({
          prompt: input.task,
          project: delegation.project,
          sceneId: delegation.sceneId,
          runId: childRun.run.id,
          threadId: delegation.threadId,
          projectId: delegation.projectId,
          sessionId: delegation.sessionId,
          parentLog: log,
        });

        for (const op of result.proposedOps) {
          ops.push(op);
        }

        await agentRunRepo.completeRun({
          runId: childRun.run.id,
          assistantText: result.assistantText,
          messages: result.messages,
          proposedOps: result.proposedOps,
          appliedOps: [],
        });

        log.info(
          `${agentName} agent returned — ${result.proposedOps.length} ops, text: ${result.assistantText.slice(0, 80)}`
        );

        return {
          assistantText: result.assistantText,
          opsCount: result.proposedOps.length,
        };
      } catch (err) {
        log.error(`${agentName} agent failed`, err);
        await agentRunRepo.completeRun({
          runId: childRun.run.id,
          proposedOps: [],
          appliedOps: [],
          error: String(err),
        }).catch((e) => log.warn(`failed to mark ${agentName} run as errored: ${e}`));
        return {
          error: `${agentName} agent failed: ${err instanceof Error ? err.message : String(err)}`,
          opsCount: 0,
        };
      }
    },
  });
}

/**
 * Creates the board manipulation + delegation tools for the core agent.
 *
 * Takes a mutable `ops` array that tools push into, and a `delegation`
 * context for spawning specialist agent runs.
 */
export function createCoreTools(params: {
  project: ProjectFile;
  sceneId: string;
  ops: BoardOp[];
  delegation: DelegationContext;
}) {
  const { project, sceneId, ops, delegation } = params;
  const projectId = project.project.id;
  const expectedVersion = project.project.version;
  const opCtx = { projectId, sceneId, expectedVersion };

  return {
    get_board_state: tool({
      description:
        "Read the current board state including components, wires, pin states, and sketch code. Use this before making changes to understand what exists.",
      inputSchema: z.object({}),
      execute: async () => {
        const scene = project.scenes[sceneId];
        const board = project.boardState;
        return {
          scene,
          components: board?.components ?? {},
          wires: board?.wires ?? {},
          pinStates: board?.pinStates ?? [],
          sketchCode: board?.sketchCode ?? "",
        };
      },
    }),

    place_component: tool({
      description:
        "Place an Arduino component on the breadboard. Component types: led, rgb_led, button, resistor, potentiometer, buzzer, servo, lcd_16x2, seven_segment, photoresistor, temperature_sensor, ultrasonic_sensor.",
      inputSchema: z.object({
        type: z
          .enum([
            "led",
            "rgb_led",
            "button",
            "resistor",
            "potentiometer",
            "buzzer",
            "servo",
            "lcd_16x2",
            "seven_segment",
            "photoresistor",
            "temperature_sensor",
            "ultrasonic_sensor",
          ])
          .describe("Type of component to place"),
        name: z.string().describe("Display name for the component (e.g. 'Red LED', 'Start Button')"),
        x: z.number().describe("Breadboard grid column"),
        y: z.number().describe("Breadboard grid row"),
        rotation: z.number().optional().describe("Rotation in degrees (default 0)"),
        pins: z
          .record(z.string(), z.number().nullable())
          .describe(
            "Component pin name -> Arduino pin number mapping. E.g. { 'anode': 13, 'cathode': null } for LED"
          ),
        properties: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Type-specific properties (e.g. { resistance: 220, color: 'red' })"),
      }),
      execute: async (input) => {
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

        return { componentId, name: input.name, type: input.type };
      },
    }),

    remove_component: tool({
      description: "Remove a component from the breadboard by ID.",
      inputSchema: z.object({
        componentId: z.string().describe("ID of the component to remove"),
      }),
      execute: async (input) => {
        ops.push(
          makeBoardOp(opCtx, {
            kind: "remove_component",
            payload: { componentId: input.componentId },
          })
        );
        return { removed: input.componentId };
      },
    }),

    connect_wire: tool({
      description:
        "Add a wire between two breadboard points. Wires connect component pins to Arduino pins or to power/ground rails.",
      inputSchema: z.object({
        fromRow: z.number().describe("Starting breadboard row"),
        fromCol: z.number().describe("Starting breadboard column"),
        toRow: z.number().describe("Ending breadboard row"),
        toCol: z.number().describe("Ending breadboard column"),
        color: z
          .string()
          .optional()
          .describe("Wire color as hex string (default '#22c55e')"),
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

        ops.push(
          makeBoardOp(opCtx, {
            kind: "connect_wire",
            payload: { wire },
          })
        );

        return { wireId };
      },
    }),

    update_sketch: tool({
      description:
        "Write or update the Arduino sketch code. Provide the full sketch source (including setup() and loop() functions).",
      inputSchema: z.object({
        code: z.string().describe("Complete Arduino sketch code"),
      }),
      execute: async (input) => {
        ops.push(
          makeBoardOp(opCtx, {
            kind: "update_sketch",
            payload: { code: input.code },
          })
        );
        return { updated: true, codeLength: input.code.length };
      },
    }),

    get_sketch: tool({
      description: "Read the current Arduino sketch code.",
      inputSchema: z.object({}),
      execute: async () => {
        const code = project.boardState?.sketchCode ?? "";
        return { code, length: code.length };
      },
    }),

    delegate_to_graph_agent: makeDelegationTool(
      "graph",
      runGraphAgent,
      "Delegate a visual programming task to the graph specialist agent. Use this when users want to build Arduino programs using visual node blocks instead of writing code directly. The specialist manages the node graph for block-based Arduino programming.",
      delegation,
      ops,
    ),

    delegate_to_circuit_agent: makeDelegationTool(
      "circuit",
      runCircuitAgent,
      "Delegate a circuit design task to the circuit specialist agent. Use this for complex circuit validation, component value suggestions, and detailed wiring guidance.",
      delegation,
      ops,
    ),
  };
}

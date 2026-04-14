import { tool } from "ai";
import { z } from "zod";
import type { ProjectFile } from "../../db/schemas";
import type { GraphOp, GraphState, GraphNode } from "@dreamer/schemas";
import { getDefaultPorts, arePortsCompatible } from "@dreamer/schemas";
import type { GraphNodeType, PortDataType } from "@dreamer/schemas";

/**
 * Context needed to stamp every graph op with project/scene metadata.
 */
type GraphOpContext = {
  projectId: string;
  sceneId: string;
  expectedVersion: number;
};

function makeGraphOp(
  ctx: GraphOpContext,
  body: Pick<GraphOp, "kind" | "payload">
): GraphOp {
  return {
    opId: crypto.randomUUID(),
    projectId: ctx.projectId,
    sceneId: ctx.sceneId,
    expectedVersion: ctx.expectedVersion,
    timestamp: new Date().toISOString(),
    ...body,
  } as GraphOp;
}

/**
 * Creates the graph manipulation tools for the graph specialist agent.
 * All tools push GraphOps into the shared `ops` array.
 */
export function createGraphTools(params: {
  project: ProjectFile;
  sceneId: string;
  ops: GraphOp[];
}) {
  const { project, sceneId, ops } = params;
  const projectId = project.project.id;
  const expectedVersion = project.project.version;
  const opCtx = { projectId, sceneId, expectedVersion };

  // In-turn mutable working graph state. The specialist reads and writes
  // against this so it sees its own prior mutations (and the parent's
  // tentative mutations, folded in via `project.graph` by the delegation
  // tool's getWorkingProject).
  const workingGraph: GraphState = structuredClone(
    project.graph ?? { nodes: {}, edges: {} }
  );

  return {
    list_graph: tool({
      description:
        "List all graph nodes and edges in the current project. Use this to understand the graph structure before making changes.",
      inputSchema: z.object({}),
      execute: async () => {
        const nodes = Object.values(workingGraph.nodes).map((n) => ({
          id: n.id,
          type: n.type,
          name: n.name,
          x: n.x,
          y: n.y,
          ports: n.ports.map((p) => ({
            id: p.id,
            name: p.name,
            direction: p.direction,
            dataType: p.dataType,
          })),
        }));
        const edges = Object.values(workingGraph.edges).map((e) => ({
          id: e.id,
          sourceNodeId: e.sourceNodeId,
          sourcePortId: e.sourcePortId,
          targetNodeId: e.targetNodeId,
          targetPortId: e.targetPortId,
        }));
        return { nodes, edges };
      },
    }),

    create_graph_node: tool({
      description:
        "Create a new node in the visual graph. Node types: setup, loop, digital_write, digital_read, pin_mode, analog_write, analog_read, delay, millis, micros, serial_begin, serial_print, serial_read, if_else, comparison, logic_gate, math, map_value, constrain, variable, constant, servo_write, tone, lcd_print, code_block. Each type has default ports and data.",
      inputSchema: z.object({
        type: z
          .enum([
            "setup",
            "loop",
            "digital_write",
            "digital_read",
            "pin_mode",
            "analog_write",
            "analog_read",
            "delay",
            "millis",
            "micros",
            "serial_begin",
            "serial_print",
            "serial_read",
            "if_else",
            "comparison",
            "logic_gate",
            "math",
            "map_value",
            "constrain",
            "variable",
            "constant",
            "servo_write",
            "tone",
            "lcd_print",
            "code_block",
          ])
          .describe("The type of node to create"),
        name: z.string().describe("Display name for the node"),
        x: z.number().optional().describe("X position in graph (default 0)"),
        y: z.number().optional().describe("Y position in graph (default 0)"),
        data: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Initial node data (merged with type defaults)"),
      }),
      execute: async (input) => {
        const nodeId = crypto.randomUUID();
        const type = input.type as GraphNodeType;
        const ports = getDefaultPorts(type);

        // Type-specific default data
        const defaultData = getDefaultDataForType(type);
        const data = { ...defaultData, ...(input.data ?? {}) };

        // Type-specific sizes
        const { width, height } = getDefaultSizeForType(type);

        const node: GraphNode = {
          id: nodeId,
          type,
          name: input.name,
          x: input.x ?? 0,
          y: input.y ?? 0,
          width,
          height,
          ports,
          data,
        };

        workingGraph.nodes[nodeId] = node;
        ops.push(
          makeGraphOp(opCtx, {
            kind: "create_graph_node",
            payload: { node },
          })
        );

        return {
          nodeId,
          name: input.name,
          type,
          ports: ports.map((p) => `${p.id} (${p.direction}, ${p.dataType})`),
        };
      },
    }),

    delete_graph_node: tool({
      description: "Delete a node from the graph. Also removes all connected edges.",
      inputSchema: z.object({
        nodeId: z.string().describe("ID of the node to delete"),
      }),
      execute: async (input) => {
        if (!workingGraph.nodes[input.nodeId]) {
          return { error: `Node ${input.nodeId} not found` };
        }
        // Cascade: drop edges that touched this node
        for (const [edgeId, edge] of Object.entries(workingGraph.edges)) {
          if (edge.sourceNodeId === input.nodeId || edge.targetNodeId === input.nodeId) {
            delete workingGraph.edges[edgeId];
          }
        }
        delete workingGraph.nodes[input.nodeId];
        ops.push(
          makeGraphOp(opCtx, {
            kind: "delete_graph_node",
            payload: { nodeId: input.nodeId, cascade: true },
          })
        );
        return { deleted: input.nodeId };
      },
    }),

    connect_nodes: tool({
      description:
        "Connect two nodes by creating an edge from a source output port to a target input port. Checks port type compatibility.",
      inputSchema: z.object({
        sourceNodeId: z.string().describe("ID of the source node"),
        sourcePortId: z.string().describe("ID of the output port on the source node"),
        targetNodeId: z.string().describe("ID of the target node"),
        targetPortId: z.string().describe("ID of the input port on the target node"),
      }),
      execute: async (input) => {
        // Validate against the live working graph (sees prior mutations)
        const sourceNode = workingGraph.nodes[input.sourceNodeId];
        const targetNode = workingGraph.nodes[input.targetNodeId];
        if (!sourceNode) {
          return { error: `Source node '${input.sourceNodeId}' not found` };
        }
        if (!targetNode) {
          return { error: `Target node '${input.targetNodeId}' not found` };
        }
        const sourcePort = sourceNode.ports.find((p) => p.id === input.sourcePortId);
        const targetPort = targetNode.ports.find((p) => p.id === input.targetPortId);
        if (!sourcePort) {
          return { error: `Source port '${input.sourcePortId}' not found on node '${sourceNode.name}'` };
        }
        if (!targetPort) {
          return { error: `Target port '${input.targetPortId}' not found on node '${targetNode.name}'` };
        }
        if (sourcePort.direction !== "out") {
          return { error: `Port '${input.sourcePortId}' is not an output port` };
        }
        if (targetPort.direction !== "in") {
          return { error: `Port '${input.targetPortId}' is not an input port` };
        }
        if (
          !arePortsCompatible(
            sourcePort.dataType as PortDataType,
            targetPort.dataType as PortDataType
          )
        ) {
          return {
            error: `Incompatible types: ${sourcePort.dataType} → ${targetPort.dataType}`,
          };
        }

        const edgeId = `edge-${crypto.randomUUID()}`;
        const edge = {
          id: edgeId,
          sourceNodeId: input.sourceNodeId,
          sourcePortId: input.sourcePortId,
          targetNodeId: input.targetNodeId,
          targetPortId: input.targetPortId,
        };
        workingGraph.edges[edgeId] = edge;
        ops.push(
          makeGraphOp(opCtx, {
            kind: "create_edge",
            payload: { edge },
          })
        );

        return { edgeId, connected: `${input.sourceNodeId}:${input.sourcePortId} → ${input.targetNodeId}:${input.targetPortId}` };
      },
    }),

    disconnect_nodes: tool({
      description: "Remove an edge (connection) from the graph by edge ID.",
      inputSchema: z.object({
        edgeId: z.string().describe("ID of the edge to remove"),
      }),
      execute: async (input) => {
        if (!workingGraph.edges[input.edgeId]) {
          return { error: `Edge ${input.edgeId} not found` };
        }
        delete workingGraph.edges[input.edgeId];
        ops.push(
          makeGraphOp(opCtx, {
            kind: "delete_edge",
            payload: { edgeId: input.edgeId },
          })
        );
        return { disconnected: input.edgeId };
      },
    }),

    update_node_data: tool({
      description:
        "Update a graph node's data fields. For digital_write: `pin`, `value`. For delay: `ms`. For serial_begin: `baudRate`. For comparison: `operator`. For logic_gate: `gate`. For math: `operation`. For variable: `name`, `dataType`, `initialValue`. For code_block: `code`.",
      inputSchema: z.object({
        nodeId: z.string().describe("ID of the node to update"),
        patch: z
          .record(z.string(), z.unknown())
          .describe("Data fields to update"),
      }),
      execute: async (input) => {
        const existing = workingGraph.nodes[input.nodeId];
        if (!existing) {
          return { error: `Node ${input.nodeId} not found` };
        }
        existing.data = { ...existing.data, ...input.patch };
        ops.push(
          makeGraphOp(opCtx, {
            kind: "update_graph_node_data",
            payload: { nodeId: input.nodeId, patch: input.patch },
          })
        );
        return { updated: input.nodeId, patch: input.patch };
      },
    }),

    move_graph_node: {
      ...tool({
        description: "Move a node to a new position in the graph layout.",
        inputSchema: z.object({
          nodeId: z.string().describe("ID of the node to move"),
          x: z.number().describe("New X position"),
          y: z.number().describe("New Y position"),
        }),
        execute: async (input) => {
          const existing = workingGraph.nodes[input.nodeId];
          if (!existing) {
            return { error: `Node ${input.nodeId} not found` };
          }
          existing.x = input.x;
          existing.y = input.y;
          ops.push(
            makeGraphOp(opCtx, {
              kind: "move_graph_node",
              payload: { nodeId: input.nodeId, x: input.x, y: input.y },
            })
          );
          return { moved: input.nodeId, x: input.x, y: input.y };
        },
      }),
      // Cache all tool definitions up to this point (the last tool)
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
  };
}

// ── Helpers for type defaults ──────────────────────────────────────────────

function getDefaultDataForType(type: GraphNodeType): Record<string, unknown> {
  switch (type) {
    case "setup":
      return {};
    case "loop":
      return {};
    case "digital_write":
      return { pin: 13, value: "HIGH" };
    case "digital_read":
      return { pin: 2 };
    case "pin_mode":
      return { pin: 13, mode: "OUTPUT" };
    case "analog_write":
      return { pin: 9, value: 128 };
    case "analog_read":
      return { pin: 0 };
    case "delay":
      return { ms: 1000 };
    case "millis":
      return {};
    case "micros":
      return {};
    case "serial_begin":
      return { baudRate: 9600 };
    case "serial_print":
      return { value: "", newline: true };
    case "serial_read":
      return {};
    case "if_else":
      return {};
    case "comparison":
      return { operator: "==" };
    case "logic_gate":
      return { gate: "AND" };
    case "math":
      return { operation: "add" };
    case "map_value":
      return { fromLow: 0, fromHigh: 1023, toLow: 0, toHigh: 255 };
    case "constrain":
      return { low: 0, high: 255 };
    case "variable":
      return { name: "myVar", dataType: "integer", initialValue: 0 };
    case "constant":
      return { value: 0, dataType: "integer" };
    case "servo_write":
      return { pin: 9, angle: 90 };
    case "tone":
      return { pin: 8, frequency: 440, duration: 0 };
    case "lcd_print":
      return { address: 0x27, cols: 16, rows: 2, text: "" };
    case "code_block":
      return { language: "cpp", code: "// Custom Arduino code\n" };
  }
}

function getDefaultSizeForType(type: GraphNodeType): { width: number; height: number } {
  switch (type) {
    case "setup":
    case "loop":
      return { width: 160, height: 70 };
    case "digital_write":
    case "digital_read":
    case "analog_write":
    case "analog_read":
      return { width: 180, height: 100 };
    case "pin_mode":
      return { width: 180, height: 90 };
    case "delay":
      return { width: 140, height: 80 };
    case "millis":
    case "micros":
      return { width: 140, height: 70 };
    case "serial_begin":
      return { width: 180, height: 80 };
    case "serial_print":
      return { width: 200, height: 100 };
    case "serial_read":
      return { width: 180, height: 90 };
    case "if_else":
      return { width: 180, height: 120 };
    case "comparison":
      return { width: 160, height: 90 };
    case "logic_gate":
      return { width: 140, height: 80 };
    case "math":
      return { width: 160, height: 90 };
    case "map_value":
      return { width: 180, height: 100 };
    case "constrain":
      return { width: 180, height: 90 };
    case "variable":
      return { width: 160, height: 90 };
    case "constant":
      return { width: 140, height: 70 };
    case "servo_write":
    case "tone":
      return { width: 180, height: 100 };
    case "lcd_print":
      return { width: 200, height: 110 };
    case "code_block":
      return { width: 240, height: 160 };
  }
}

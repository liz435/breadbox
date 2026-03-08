import { tool } from "ai";
import { z } from "zod";
import type { ProjectFile } from "../../db/schemas";
import type { GraphOp } from "@dreamer/schemas";
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

  return {
    list_graph: tool({
      description:
        "List all graph nodes and edges in the current project. Use this to understand the graph structure before making changes.",
      inputSchema: z.object({}),
      execute: async () => {
        const graph = project.graph;
        if (!graph) {
          return { nodes: [], edges: [], message: "No graph data in project yet." };
        }
        const nodes = Object.values(graph.nodes).map((n) => ({
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
        const edges = Object.values(graph.edges).map((e) => ({
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
        "Create a new node in the visual graph. Node types: sprite, shader, code, audio, video, text, material, math, group, on_start, on_update, on_input, input_map. Each type has default ports and data.",
      inputSchema: z.object({
        type: z
          .enum([
            "sprite",
            "shader",
            "code",
            "audio",
            "video",
            "text",
            "material",
            "math",
            "group",
            "on_start",
            "on_update",
            "on_input",
            "input_map",
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

        const node = {
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
        // Validate port compatibility if graph data is available
        const graph = project.graph;
        if (graph) {
          const sourceNode = graph.nodes[input.sourceNodeId];
          const targetNode = graph.nodes[input.targetNodeId];
          if (sourceNode && targetNode) {
            const sourcePort = sourceNode.ports.find(
              (p) => p.id === input.sourcePortId
            );
            const targetPort = targetNode.ports.find(
              (p) => p.id === input.targetPortId
            );
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
          }
        }

        const edgeId = `edge-${crypto.randomUUID()}`;
        ops.push(
          makeGraphOp(opCtx, {
            kind: "create_edge",
            payload: {
              edge: {
                id: edgeId,
                sourceNodeId: input.sourceNodeId,
                sourcePortId: input.sourcePortId,
                targetNodeId: input.targetNodeId,
                targetPortId: input.targetPortId,
              },
            },
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
        "Update a graph node's data fields. For shader nodes: update `code`, `language`. For math nodes: update `operation`. For text nodes: update `content`. For audio: `volume`, `pitch`, `loop`.",
      inputSchema: z.object({
        nodeId: z.string().describe("ID of the node to update"),
        patch: z
          .record(z.string(), z.unknown())
          .describe("Data fields to update"),
      }),
      execute: async (input) => {
        ops.push(
          makeGraphOp(opCtx, {
            kind: "update_graph_node_data",
            payload: { nodeId: input.nodeId, patch: input.patch },
          })
        );
        return { updated: input.nodeId, patch: input.patch };
      },
    }),

    move_graph_node: tool({
      description: "Move a node to a new position in the graph layout.",
      inputSchema: z.object({
        nodeId: z.string().describe("ID of the node to move"),
        x: z.number().describe("New X position"),
        y: z.number().describe("New Y position"),
      }),
      execute: async (input) => {
        ops.push(
          makeGraphOp(opCtx, {
            kind: "move_graph_node",
            payload: { nodeId: input.nodeId, x: input.x, y: input.y },
          })
        );
        return { moved: input.nodeId, x: input.x, y: input.y };
      },
    }),
  };
}

// ── Helpers for type defaults ──────────────────────────────────────────────

function getDefaultDataForType(type: GraphNodeType): Record<string, unknown> {
  switch (type) {
    case "sprite":
      return { tint: "#4a9eff", width: 64, height: 64, sceneX: 400, sceneY: 300 };
    case "shader":
      return { language: "glsl", code: "void main() {\n  gl_FragColor = vec4(1.0);\n}" };
    case "code":
      return { language: "typescript", code: "// behavior script\nexport function update(dt: number) {\n  \n}" };
    case "audio":
      return { volume: 1.0, pitch: 1.0, loop: false };
    case "video":
      return { playbackRate: 1.0, loop: false };
    case "text":
      return { content: "" };
    case "material":
      return { blend: "normal" };
    case "math":
      return { operation: "add" };
    case "group":
      return { childNodeIds: [] };
    case "on_start":
      return {};
    case "on_update":
      return {};
    case "on_input":
      return { listenKeys: ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] };
    case "input_map":
      return { actions: { move_up: "ArrowUp", move_down: "ArrowDown", move_left: "ArrowLeft", move_right: "ArrowRight" } };
    default:
      return {};
  }
}

function getDefaultSizeForType(type: GraphNodeType): { width: number; height: number } {
  switch (type) {
    case "sprite":
      return { width: 200, height: 150 };
    case "shader":
    case "code":
      return { width: 220, height: 160 };
    case "audio":
      return { width: 200, height: 140 };
    case "video":
      return { width: 200, height: 170 };
    case "text":
      return { width: 200, height: 120 };
    case "math":
      return { width: 140, height: 80 };
    case "group":
      return { width: 240, height: 180 };
    case "on_start":
      return { width: 160, height: 70 };
    case "on_update":
      return { width: 160, height: 80 };
    case "on_input":
      return { width: 160, height: 80 };
    case "input_map":
      return { width: 200, height: 140 };
    default:
      return { width: 180, height: 100 };
  }
}

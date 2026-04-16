import { describe, test, expect } from "bun:test";
import type { Edge } from "@dreamer/schemas";
import type { GraphState } from "@/store/graph-machine";
import { createGraphNode } from "@/graph/node-factory";
import {
  formatFileSize,
  getConnectedEdgesForNode,
  getEdgeEndpointDetails,
  getSelectedEdgeForInspector,
  getSelectedNodeForInspector,
  splitNodePorts,
} from "@/panels/graph-inspector";

function createState(partial: Partial<GraphState> = {}): GraphState {
  return {
    nodes: {},
    edges: {},
    selectedNodeIds: new Set<string>(),
    selectedEdgeIds: new Set<string>(),
    ...partial,
  };
}

describe("GraphInspector helpers", () => {
  test("formatFileSize handles byte, KB, and MB ranges", () => {
    expect(formatFileSize(999)).toBe("999 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  test("returns a single selected node only when exactly one valid node is selected", () => {
    const setup = createGraphNode("setup");
    const state = createState({
      nodes: { [setup.id]: setup },
      selectedNodeIds: new Set([setup.id]),
    });

    expect(getSelectedNodeForInspector(state)?.id).toBe(setup.id);
    expect(getSelectedNodeForInspector(createState())).toBeNull();
    expect(
      getSelectedNodeForInspector(
        createState({
          nodes: { [setup.id]: setup },
          selectedNodeIds: new Set([setup.id, "other"]),
        })
      )
    ).toBeNull();
  });

  test("returns a single selected edge only when exactly one valid edge is selected", () => {
    const edge: Edge = {
      id: "edge-1",
      sourceNodeId: "a",
      sourcePortId: "flow_out",
      targetNodeId: "b",
      targetPortId: "flow_in",
    };

    const state = createState({
      edges: { [edge.id]: edge },
      selectedEdgeIds: new Set([edge.id]),
    });
    expect(getSelectedEdgeForInspector(state)?.id).toBe(edge.id);
    expect(getSelectedEdgeForInspector(createState())).toBeNull();
  });

  test("resolves edge endpoint nodes and ports from graph data", () => {
    const setup = createGraphNode("setup");
    const digitalWrite = createGraphNode("digital_write");
    const edge: Edge = {
      id: "e1",
      sourceNodeId: setup.id,
      sourcePortId: "flow_out",
      targetNodeId: digitalWrite.id,
      targetPortId: "flow_in",
    };

    const details = getEdgeEndpointDetails(edge, {
      [setup.id]: setup,
      [digitalWrite.id]: digitalWrite,
    });

    expect(details.sourceNode?.id).toBe(setup.id);
    expect(details.targetNode?.id).toBe(digitalWrite.id);
    expect(details.sourcePort?.id).toBe("flow_out");
    expect(details.targetPort?.id).toBe("flow_in");
  });

  test("connected edges only include edges touching the requested node", () => {
    const setup = createGraphNode("setup");
    const digitalWrite = createGraphNode("digital_write");
    const delay = createGraphNode("delay");

    const edges: Record<string, Edge> = {
      e1: {
        id: "e1",
        sourceNodeId: setup.id,
        sourcePortId: "flow_out",
        targetNodeId: digitalWrite.id,
        targetPortId: "flow_in",
      },
      e2: {
        id: "e2",
        sourceNodeId: delay.id,
        sourcePortId: "flow_out",
        targetNodeId: digitalWrite.id,
        targetPortId: "flow_in",
      },
      e3: {
        id: "e3",
        sourceNodeId: setup.id,
        sourcePortId: "flow_out",
        targetNodeId: delay.id,
        targetPortId: "flow_in",
      },
    };

    const state = createState({ edges });
    const toDigitalWrite = getConnectedEdgesForNode(state, digitalWrite.id);
    const toSetup = getConnectedEdgesForNode(state, setup.id);

    expect(toDigitalWrite.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    expect(toSetup.map((e) => e.id).sort()).toEqual(["e1", "e3"]);
  });

  test("splits node ports by direction for input/output sections", () => {
    const digitalWrite = createGraphNode("digital_write");
    const { inputPorts, outputPorts } = splitNodePorts(digitalWrite);

    expect(inputPorts.length).toBeGreaterThan(0);
    expect(outputPorts.length).toBeGreaterThan(0);
    expect(inputPorts.every((port) => port.direction === "in")).toBe(true);
    expect(outputPorts.every((port) => port.direction === "out")).toBe(true);
    expect(inputPorts.length + outputPorts.length).toBe(digitalWrite.ports.length);
  });
});

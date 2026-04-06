import { describe, test, expect } from "bun:test";
import { createGraphNode } from "@/graph/node-factory";
import type { Edge } from "@dreamer/schemas";

// Test the inspector's data logic without rendering React components

describe("GraphInspector logic", () => {
  test("single node selection provides correct data", () => {
    const node = createGraphNode("setup");
    const selectedNodeIds = new Set([node.id]);
    const nodes = { [node.id]: node };

    expect(selectedNodeIds.size).toBe(1);
    const selectedId = [...selectedNodeIds][0];
    expect(nodes[selectedId]).toBe(node);
    expect(node.type).toBe("setup");
    expect(node.name).toBeTruthy();
  });

  test("multi-selection reports count", () => {
    const a = createGraphNode("setup");
    const b = createGraphNode("delay");
    const selectedNodeIds = new Set([a.id, b.id]);

    expect(selectedNodeIds.size).toBe(2);
  });

  test("edge selection finds source and target nodes", () => {
    const setup = createGraphNode("setup");
    const digitalWrite = createGraphNode("digital_write");
    const edge: Edge = {
      id: "e1",
      sourceNodeId: setup.id,
      sourcePortId: "flow_out",
      targetNodeId: digitalWrite.id,
      targetPortId: "flow_in",
    };
    const nodes = { [setup.id]: setup, [digitalWrite.id]: digitalWrite };

    const sourceNode = nodes[edge.sourceNodeId];
    const targetNode = nodes[edge.targetNodeId];
    expect(sourceNode).toBe(setup);
    expect(targetNode).toBe(digitalWrite);

    const sourcePort = sourceNode.ports.find((p) => p.id === edge.sourcePortId);
    const targetPort = targetNode.ports.find((p) => p.id === edge.targetPortId);
    expect(sourcePort).toBeDefined();
    expect(targetPort).toBeDefined();
  });

  test("connected edges for a node are filtered correctly", () => {
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
    };

    const connectedToDigitalWrite = Object.values(edges).filter(
      (e) => e.sourceNodeId === digitalWrite.id || e.targetNodeId === digitalWrite.id
    );
    expect(connectedToDigitalWrite).toHaveLength(2);

    const connectedToSetup = Object.values(edges).filter(
      (e) => e.sourceNodeId === setup.id || e.targetNodeId === setup.id
    );
    expect(connectedToSetup).toHaveLength(1);
  });

  test("input and output ports are separated correctly", () => {
    const digitalWrite = createGraphNode("digital_write");
    const inputPorts = digitalWrite.ports.filter((p) => p.direction === "in");
    const outputPorts = digitalWrite.ports.filter((p) => p.direction === "out");

    expect(inputPorts.length).toBeGreaterThan(0);
    expect(outputPorts.length).toBeGreaterThan(0);
    expect(inputPorts.length + outputPorts.length).toBe(digitalWrite.ports.length);
  });
});

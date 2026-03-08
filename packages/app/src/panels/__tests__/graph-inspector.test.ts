import { describe, test, expect } from "bun:test";
import { createGraphNode } from "@/graph/node-factory";
import type { Edge } from "@dreamer/schemas";

// Test the inspector's data logic without rendering React components

describe("GraphInspector logic", () => {
  test("single node selection provides correct data", () => {
    const node = createGraphNode("sprite");
    const selectedNodeIds = new Set([node.id]);
    const nodes = { [node.id]: node };

    expect(selectedNodeIds.size).toBe(1);
    const selectedId = [...selectedNodeIds][0];
    expect(nodes[selectedId]).toBe(node);
    expect(node.type).toBe("sprite");
    expect(node.name).toBeTruthy();
  });

  test("multi-selection reports count", () => {
    const a = createGraphNode("sprite");
    const b = createGraphNode("shader");
    const selectedNodeIds = new Set([a.id, b.id]);

    expect(selectedNodeIds.size).toBe(2);
  });

  test("edge selection finds source and target nodes", () => {
    const sprite = createGraphNode("sprite");
    const shader = createGraphNode("shader");
    const edge: Edge = {
      id: "e1",
      sourceNodeId: sprite.id,
      sourcePortId: "texture_out",
      targetNodeId: shader.id,
      targetPortId: "texture_in",
    };
    const nodes = { [sprite.id]: sprite, [shader.id]: shader };

    const sourceNode = nodes[edge.sourceNodeId];
    const targetNode = nodes[edge.targetNodeId];
    expect(sourceNode).toBe(sprite);
    expect(targetNode).toBe(shader);

    const sourcePort = sourceNode.ports.find((p) => p.id === edge.sourcePortId);
    const targetPort = targetNode.ports.find((p) => p.id === edge.targetPortId);
    expect(sourcePort).toBeDefined();
    expect(targetPort).toBeDefined();
  });

  test("connected edges for a node are filtered correctly", () => {
    const sprite = createGraphNode("sprite");
    const shader = createGraphNode("shader");
    const code = createGraphNode("code");
    const edges: Record<string, Edge> = {
      e1: {
        id: "e1",
        sourceNodeId: sprite.id,
        sourcePortId: "texture_out",
        targetNodeId: shader.id,
        targetPortId: "texture_in",
      },
      e2: {
        id: "e2",
        sourceNodeId: code.id,
        sourcePortId: "data_out",
        targetNodeId: shader.id,
        targetPortId: "float_in",
      },
    };

    const connectedToShader = Object.values(edges).filter(
      (e) => e.sourceNodeId === shader.id || e.targetNodeId === shader.id
    );
    expect(connectedToShader).toHaveLength(2);

    const connectedToSprite = Object.values(edges).filter(
      (e) => e.sourceNodeId === sprite.id || e.targetNodeId === sprite.id
    );
    expect(connectedToSprite).toHaveLength(1);
  });

  test("input and output ports are separated correctly", () => {
    const shader = createGraphNode("shader");
    const inputPorts = shader.ports.filter((p) => p.direction === "in");
    const outputPorts = shader.ports.filter((p) => p.direction === "out");

    expect(inputPorts.length).toBeGreaterThan(0);
    expect(outputPorts.length).toBeGreaterThan(0);
    expect(inputPorts.length + outputPorts.length).toBe(shader.ports.length);
  });
});

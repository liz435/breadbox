import { useMemo } from "react";
import { NumberField } from "@base-ui/react/number-field";
import { Field } from "@base-ui/react/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useGraph } from "@/store/graph-context";
import { getPortColor, getNodeColor } from "@/graph/port-colors";

export function GraphInspector() {
  const { state, send } = useGraph();

  const selectedNode = useMemo(() => {
    const ids = [...state.selectedNodeIds];
    if (ids.length !== 1) return null;
    return state.nodes[ids[0]] ?? null;
  }, [state.selectedNodeIds, state.nodes]);

  const selectedEdge = useMemo(() => {
    const ids = [...state.selectedEdgeIds];
    if (ids.length !== 1) return null;
    return state.edges[ids[0]] ?? null;
  }, [state.selectedEdgeIds, state.edges]);

  // ── Multi-selection summary ──────────────────────────────────────────────
  if (state.selectedNodeIds.size > 1) {
    return (
      <div className="p-3 flex flex-col gap-2">
        <Label>{state.selectedNodeIds.size} nodes selected</Label>
        <Separator />
        <div className="text-xs text-neutral-400">
          {[...state.selectedNodeIds].map((id) => {
            const node = state.nodes[id];
            return node ? (
              <div key={id} className="flex items-center gap-1.5 py-0.5">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: getNodeColor(node.type) }}
                />
                <span>{node.name}</span>
              </div>
            ) : null;
          })}
        </div>
      </div>
    );
  }

  // ── Edge inspector ───────────────────────────────────────────────────────
  if (selectedEdge) {
    const sourceNode = state.nodes[selectedEdge.sourceNodeId];
    const targetNode = state.nodes[selectedEdge.targetNodeId];
    const sourcePort = sourceNode?.ports.find(
      (p) => p.id === selectedEdge.sourcePortId
    );
    const targetPort = targetNode?.ports.find(
      (p) => p.id === selectedEdge.targetPortId
    );

    return (
      <div className="p-3 flex flex-col gap-3">
        <Label>Edge</Label>
        <Separator />
        <div className="text-xs flex flex-col gap-2">
          <div>
            <span className="text-neutral-500">From: </span>
            <span className="text-neutral-200">
              {sourceNode?.name ?? "?"} &rarr; {sourcePort?.name ?? selectedEdge.sourcePortId}
            </span>
          </div>
          <div>
            <span className="text-neutral-500">To: </span>
            <span className="text-neutral-200">
              {targetNode?.name ?? "?"} &rarr; {targetPort?.name ?? selectedEdge.targetPortId}
            </span>
          </div>
          {sourcePort && (
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500">Type: </span>
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: getPortColor(sourcePort.dataType) }}
              />
              <span className="text-neutral-200">{sourcePort.dataType}</span>
            </div>
          )}
        </div>
        <Separator />
        <button
          className="text-xs text-red-400 hover:text-red-300 text-left"
          onClick={() => send({ type: "REMOVE_EDGE", edgeId: selectedEdge.id })}
        >
          Delete edge
        </button>
      </div>
    );
  }

  // ── Node inspector ───────────────────────────────────────────────────────
  if (selectedNode) {
    const inputPorts = selectedNode.ports.filter((p) => p.direction === "in");
    const outputPorts = selectedNode.ports.filter((p) => p.direction === "out");

    // Find connected edges for each port
    const connectedEdges = Object.values(state.edges).filter(
      (e) =>
        e.sourceNodeId === selectedNode.id ||
        e.targetNodeId === selectedNode.id
    );

    return (
      <div className="p-3 flex flex-col gap-3">
        {/* Node header */}
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded"
            style={{ backgroundColor: getNodeColor(selectedNode.type) }}
          />
          <span className="text-xs uppercase tracking-wide text-neutral-500 font-medium">
            {selectedNode.type}
          </span>
        </div>

        {/* Name */}
        <Field.Root>
          <Field.Label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
            Name
          </Field.Label>
          <Input
            className="h-auto px-2 py-1"
            value={selectedNode.name}
            onChange={(e) => {
              send({
                type: "UPDATE_NODE",
                nodeId: selectedNode.id,
                patch: { name: (e.target as HTMLInputElement).value },
              });
            }}
          />
        </Field.Root>

        <Separator />

        {/* Position */}
        <div className="flex gap-2">
          <NumberField.Root
            value={Math.round(selectedNode.x)}
            onValueChange={(val) => {
              if (val == null) return;
              send({
                type: "MOVE_NODE",
                nodeId: selectedNode.id,
                x: val,
                y: selectedNode.y,
              });
            }}
          >
            <NumberField.ScrubArea>
              <Label className="cursor-ew-resize">X</Label>
            </NumberField.ScrubArea>
            <NumberField.Group>
              <NumberField.Input className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm outline-none w-full transition-colors focus:border-neutral-500" />
            </NumberField.Group>
          </NumberField.Root>
          <NumberField.Root
            value={Math.round(selectedNode.y)}
            onValueChange={(val) => {
              if (val == null) return;
              send({
                type: "MOVE_NODE",
                nodeId: selectedNode.id,
                x: selectedNode.x,
                y: val,
              });
            }}
          >
            <NumberField.ScrubArea>
              <Label className="cursor-ew-resize">Y</Label>
            </NumberField.ScrubArea>
            <NumberField.Group>
              <NumberField.Input className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm outline-none w-full transition-colors focus:border-neutral-500" />
            </NumberField.Group>
          </NumberField.Root>
        </div>

        <Separator />

        {/* Ports */}
        {inputPorts.length > 0 && (
          <div>
            <Label className="mb-1">Inputs</Label>
            <div className="flex flex-col gap-1">
              {inputPorts.map((port) => {
                const edge = connectedEdges.find(
                  (e) =>
                    e.targetNodeId === selectedNode.id &&
                    e.targetPortId === port.id
                );
                const sourceNode = edge
                  ? state.nodes[edge.sourceNodeId]
                  : null;
                return (
                  <div
                    key={port.id}
                    className="flex items-center gap-1.5 text-xs py-0.5"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getPortColor(port.dataType) }}
                    />
                    <span className="text-neutral-300">{port.name}</span>
                    <span className="text-neutral-600 ml-auto text-[10px]">
                      {edge ? sourceNode?.name ?? "connected" : "unconnected"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {outputPorts.length > 0 && (
          <div>
            <Label className="mb-1">Outputs</Label>
            <div className="flex flex-col gap-1">
              {outputPorts.map((port) => {
                const edgeCount = connectedEdges.filter(
                  (e) =>
                    e.sourceNodeId === selectedNode.id &&
                    e.sourcePortId === port.id
                ).length;
                return (
                  <div
                    key={port.id}
                    className="flex items-center gap-1.5 text-xs py-0.5"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getPortColor(port.dataType) }}
                    />
                    <span className="text-neutral-300">{port.name}</span>
                    <span className="text-neutral-600 ml-auto text-[10px]">
                      {edgeCount > 0
                        ? `${edgeCount} connection${edgeCount > 1 ? "s" : ""}`
                        : "unconnected"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Separator />
        <button
          className="text-xs text-red-400 hover:text-red-300 text-left"
          onClick={() =>
            send({ type: "REMOVE_NODE", nodeId: selectedNode.id })
          }
        >
          Delete node
        </button>
      </div>
    );
  }

  // ── Nothing selected ─────────────────────────────────────────────────────
  return null;
}

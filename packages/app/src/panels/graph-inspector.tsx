import { useMemo, useState, useCallback } from "react";
import { NumberField } from "@base-ui/react/number-field";
import { Field } from "@base-ui/react/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useGraph } from "@/store/graph-context";
import { getPortColor, getNodeColor } from "@/graph/port-colors";
import { MATH_OPERATIONS } from "@/graph/node-factory";
import type { GraphNode, GraphNodeType } from "@dreamer/schemas";
import { graphNodeTypeSchema } from "@dreamer/schemas";


function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PropertyRow({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-300">{String(value)}</span>
    </div>
  );
}

const selectClass =
  "text-xs text-neutral-300 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-neutral-500 transition-colors w-full";
const numInputClass =
  "bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs outline-none w-full transition-colors focus:border-neutral-500 text-neutral-300";
const checkboxClass =
  "w-3.5 h-3.5 rounded border border-neutral-600 bg-neutral-900 accent-blue-500 cursor-pointer";

function KeyBindingEditor({
  keys,
  onUpdate,
}: {
  keys: string[];
  onUpdate: (keys: string[]) => void;
}) {
  const [listening, setListening] = useState(false);

  const handleKeyCapture = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const key = e.key;
      if (key === "Escape") {
        setListening(false);
        return;
      }
      if (!keys.includes(key)) {
        onUpdate([...keys, key]);
      }
      setListening(false);
    },
    [keys, onUpdate],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {keys.map((key) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[10px] text-neutral-300 font-mono"
          >
            {key}
            <button
              className="text-neutral-500 hover:text-red-400 transition-colors leading-none"
              onClick={() => onUpdate(keys.filter((k) => k !== key))}
            >
              x
            </button>
          </span>
        ))}
      </div>
      {listening ? (
        <div
          className="text-[10px] text-blue-400 border border-blue-500/30 rounded px-2 py-1 bg-blue-500/5 outline-none"
          tabIndex={0}
          autoFocus
          onKeyDown={handleKeyCapture}
          onBlur={() => setListening(false)}
        >
          Press a key... (Esc to cancel)
        </div>
      ) : (
        <button
          className="text-[10px] text-neutral-500 hover:text-neutral-300 text-left transition-colors"
          onClick={() => setListening(true)}
        >
          + Add key
        </button>
      )}
    </div>
  );
}

function NodeProperties({
  node,
  onUpdateData,
}: {
  node: GraphNode;
  onUpdateData: (patch: Record<string, unknown>) => void;
}) {
  const { type, data } = node;

  switch (type) {
    case "sprite":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Sprite</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Tint</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={typeof data.tint === "string" ? data.tint : "#4a9eff"}
                onChange={(e) => onUpdateData({ tint: e.target.value })}
                className="w-6 h-5 rounded border border-neutral-600 bg-transparent cursor-pointer p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded"
              />
              <input
                type="text"
                value={typeof data.tint === "string" ? data.tint : "#4a9eff"}
                onChange={(e) => onUpdateData({ tint: e.target.value })}
                className="text-xs text-neutral-300 bg-transparent border-none outline-none w-16 font-mono"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <span className="text-[10px] text-neutral-500 block mb-0.5">Scene X</span>
              <input
                type="number"
                value={typeof data.sceneX === "number" ? data.sceneX : 0}
                onChange={(e) => onUpdateData({ sceneX: Number(e.target.value) })}
                className={numInputClass}
              />
            </div>
            <div className="flex-1">
              <span className="text-[10px] text-neutral-500 block mb-0.5">Scene Y</span>
              <input
                type="number"
                value={typeof data.sceneY === "number" ? data.sceneY : 0}
                onChange={(e) => onUpdateData({ sceneY: Number(e.target.value) })}
                className={numInputClass}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <span className="text-[10px] text-neutral-500 block mb-0.5">Width</span>
              <input
                type="number"
                value={typeof data.width === "number" ? data.width : 64}
                onChange={(e) => onUpdateData({ width: Number(e.target.value) })}
                className={numInputClass}
                min={1}
              />
            </div>
            <div className="flex-1">
              <span className="text-[10px] text-neutral-500 block mb-0.5">Height</span>
              <input
                type="number"
                value={typeof data.height === "number" ? data.height : 64}
                onChange={(e) => onUpdateData({ height: Number(e.target.value) })}
                className={numInputClass}
                min={1}
              />
            </div>
          </div>
        </div>
      );

    case "audio":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Audio</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Volume</span>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={typeof data.volume === "number" ? data.volume : 1}
                onChange={(e) => onUpdateData({ volume: Number(e.target.value) })}
                className="w-16 h-1 accent-blue-500 cursor-pointer"
              />
              <span className="text-neutral-300 w-8 text-right">
                {Math.round((typeof data.volume === "number" ? data.volume : 1) * 100)}%
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Pitch</span>
            <input
              type="number"
              value={typeof data.pitch === "number" ? data.pitch : 1}
              onChange={(e) => onUpdateData({ pitch: Number(e.target.value) })}
              className={numInputClass + " !w-16"}
              step={0.1}
              min={0.1}
              max={4}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Loop</span>
            <input
              type="checkbox"
              checked={data.loop === true}
              onChange={(e) => onUpdateData({ loop: e.target.checked })}
              className={checkboxClass}
            />
          </div>
        </div>
      );

    case "video":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Video</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Playback rate</span>
            <input
              type="number"
              value={typeof data.playbackRate === "number" ? data.playbackRate : 1}
              onChange={(e) => onUpdateData({ playbackRate: Number(e.target.value) })}
              className={numInputClass + " !w-16"}
              step={0.25}
              min={0.25}
              max={4}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Loop</span>
            <input
              type="checkbox"
              checked={data.loop === true}
              onChange={(e) => onUpdateData({ loop: e.target.checked })}
              className={checkboxClass}
            />
          </div>
        </div>
      );

    case "shader":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Shader</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Language</span>
            <select
              value={typeof data.language === "string" ? data.language : "glsl"}
              onChange={(e) => onUpdateData({ language: e.target.value })}
              className={selectClass + " !w-20"}
            >
              <option value="glsl">GLSL</option>
              <option value="wgsl">WGSL</option>
              <option value="hlsl">HLSL</option>
            </select>
          </div>
          <div>
            <span className="text-[10px] text-neutral-500 block mb-1">Code</span>
            <textarea
              value={typeof data.code === "string" ? data.code : ""}
              onChange={(e) => onUpdateData({ code: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-[11px] text-neutral-300 font-mono outline-none resize-y min-h-20 max-h-60 transition-colors focus:border-neutral-500"
              spellCheck={false}
              rows={8}
            />
          </div>
        </div>
      );

    case "code":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Script</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Language</span>
            <select
              value={typeof data.language === "string" ? data.language : "javascript"}
              onChange={(e) => onUpdateData({ language: e.target.value })}
              className={selectClass + " !w-24"}
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
            </select>
          </div>
          <div>
            <span className="text-[10px] text-neutral-500 block mb-1">Code</span>
            <textarea
              value={typeof data.code === "string" ? data.code : ""}
              onChange={(e) => onUpdateData({ code: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-[11px] text-neutral-300 font-mono outline-none resize-y min-h-20 max-h-60 transition-colors focus:border-neutral-500"
              spellCheck={false}
              rows={10}
            />
          </div>
        </div>
      );

    case "text":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Text</Label>
          <textarea
            value={typeof data.content === "string" ? data.content : ""}
            onChange={(e) => onUpdateData({ content: e.target.value })}
            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-300 outline-none resize-y min-h-16 max-h-40 transition-colors focus:border-neutral-500"
            rows={4}
          />
          <PropertyRow
            label="Length"
            value={typeof data.content === "string" ? `${data.content.length} chars` : "0 chars"}
          />
        </div>
      );

    case "material":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Material</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Blend</span>
            <select
              value={typeof data.blend === "string" ? data.blend : "normal"}
              onChange={(e) => onUpdateData({ blend: e.target.value })}
              className={selectClass + " !w-24"}
            >
              <option value="normal">Normal</option>
              <option value="additive">Additive</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
            </select>
          </div>
        </div>
      );

    case "math":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Math</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Operation</span>
            <select
              value={typeof data.operation === "string" ? data.operation : "add"}
              onChange={(e) => onUpdateData({ operation: e.target.value })}
              className={selectClass + " !w-24"}
            >
              {MATH_OPERATIONS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      );

    case "on_input":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Input Keys</Label>
          <KeyBindingEditor
            keys={Array.isArray(data.listenKeys) ? (data.listenKeys as string[]) : []}
            onUpdate={(newKeys) => onUpdateData({ listenKeys: newKeys })}
          />
        </div>
      );

    case "group":
      return (
        <div className="flex flex-col gap-1">
          <Label className="mb-0.5">Group</Label>
          <PropertyRow
            label="Children"
            value={Array.isArray(data.childNodeIds) ? data.childNodeIds.length : 0}
          />
        </div>
      );

    default:
      return null;
  }
}

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
        {/* Node header with type selector */}
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded"
            style={{ backgroundColor: getNodeColor(selectedNode.type) }}
          />
          <select
            className="text-xs uppercase tracking-wide text-neutral-300 font-medium bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-neutral-500 transition-colors"
            value={selectedNode.type}
            onChange={(e) => {
              send({
                type: "CHANGE_NODE_TYPE",
                nodeId: selectedNode.id,
                newType: e.target.value as GraphNodeType,
              });
            }}
          >
            {graphNodeTypeSchema.options.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
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
                type: "RENAME_NODE",
                nodeId: selectedNode.id,
                name: (e.target as HTMLInputElement).value,
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

        {/* Dimensions */}
        <div className="flex gap-2">
          <div className="flex-1">
            <span className="text-[10px] text-neutral-500">W</span>
            <span className="text-xs text-neutral-300 ml-1">{selectedNode.width}</span>
          </div>
          <div className="flex-1">
            <span className="text-[10px] text-neutral-500">H</span>
            <span className="text-xs text-neutral-300 ml-1">{selectedNode.height}</span>
          </div>
        </div>

        <Separator />

        {/* File / Asset info */}
        {Boolean(selectedNode.data.fileName || selectedNode.data.fileType || selectedNode.data.uri) && (
          <div>
            <Label className="mb-1">Asset</Label>
            <div className="flex flex-col gap-1 text-xs">
              {typeof selectedNode.data.fileName === "string" && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">File</span>
                  <span className="text-neutral-300 truncate ml-2 max-w-35">{selectedNode.data.fileName}</span>
                </div>
              )}
              {typeof selectedNode.data.fileType === "string" && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Type</span>
                  <span className="text-neutral-300">{selectedNode.data.fileType}</span>
                </div>
              )}
              {typeof selectedNode.data.fileSize === "number" && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Size</span>
                  <span className="text-neutral-300">{formatFileSize(selectedNode.data.fileSize)}</span>
                </div>
              )}
            </div>
            <Separator className="my-2" />
          </div>
        )}

        {/* Type-specific properties */}
        <NodeProperties
          node={selectedNode}
          onUpdateData={(patch) =>
            send({ type: "UPDATE_NODE", nodeId: selectedNode.id, patch })
          }
        />

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

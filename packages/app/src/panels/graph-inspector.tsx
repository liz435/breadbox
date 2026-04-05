import { useMemo, useState, useCallback } from "react";
import { NumberField } from "@base-ui/react/number-field";
import { Field } from "@base-ui/react/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useGraph } from "@/store/graph-context";
import { getPortColor, getNodeColor } from "@/graph/port-colors";
import { MATH_OPERATIONS, type InputAction } from "@/graph/node-factory";
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

function InputMapEditor({
  actions,
  onUpdate,
}: {
  actions: InputAction[];
  onUpdate: (actions: InputAction[]) => void;
}) {
  const [listeningIdx, setListeningIdx] = useState<number | null>(null);

  const handleKeyCapture = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      e.preventDefault();
      e.stopPropagation();
      const key = e.key;
      if (key === "Escape") {
        setListeningIdx(null);
        return;
      }
      const action = actions[idx];
      if (action && !action.keys.includes(key)) {
        const updated = [...actions];
        updated[idx] = { ...action, keys: [...action.keys, key] };
        onUpdate(updated);
      }
      setListeningIdx(null);
    },
    [actions, onUpdate],
  );

  const removeKey = useCallback(
    (actionIdx: number, key: string) => {
      const updated = [...actions];
      const action = updated[actionIdx];
      if (action) {
        updated[actionIdx] = { ...action, keys: action.keys.filter((k) => k !== key) };
        onUpdate(updated);
      }
    },
    [actions, onUpdate],
  );

  const removeAction = useCallback(
    (idx: number) => {
      onUpdate(actions.filter((_, i) => i !== idx));
    },
    [actions, onUpdate],
  );

  const addAction = useCallback(() => {
    const name = `action_${actions.length}`;
    onUpdate([...actions, { name, label: `Action ${actions.length}`, keys: [] }]);
  }, [actions, onUpdate]);

  const updateActionField = useCallback(
    (idx: number, field: "name" | "label", value: string) => {
      const updated = [...actions];
      const action = updated[idx];
      if (action) {
        updated[idx] = { ...action, [field]: value };
        onUpdate(updated);
      }
    },
    [actions, onUpdate],
  );

  return (
    <div className="flex flex-col gap-2">
      {actions.map((action, idx) => (
        <div
          key={idx}
          className="border border-neutral-700 rounded p-1.5 flex flex-col gap-1"
        >
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={action.label}
              onChange={(e) => updateActionField(idx, "label", e.target.value)}
              className="flex-1 min-w-0 text-[10px] text-neutral-300 bg-transparent border-b border-neutral-700 outline-none px-0.5"
              placeholder="Label"
            />
            <button
              className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors leading-none shrink-0"
              onClick={() => removeAction(idx)}
            >
              x
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-neutral-500 shrink-0">id:</span>
            <input
              type="text"
              value={action.name}
              onChange={(e) => updateActionField(idx, "name", e.target.value.replace(/\s/g, "_"))}
              className="flex-1 min-w-0 text-[9px] text-neutral-400 bg-transparent outline-none font-mono px-0.5"
              placeholder="action_name"
            />
          </div>
          <div className="flex flex-wrap gap-0.5">
            {action.keys.map((key) => (
              <span
                key={key}
                className="inline-flex items-center gap-0.5 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-[9px] text-neutral-300 font-mono"
              >
                {key}
                <button
                  className="text-neutral-500 hover:text-red-400 transition-colors leading-none"
                  onClick={() => removeKey(idx, key)}
                >
                  x
                </button>
              </span>
            ))}
            {listeningIdx === idx ? (
              <div
                className="text-[9px] text-blue-400 border border-blue-500/30 rounded px-1.5 py-0.5 bg-blue-500/5 outline-none"
                tabIndex={0}
                autoFocus
                onKeyDown={(e) => handleKeyCapture(e, idx)}
                onBlur={() => setListeningIdx(null)}
              >
                Press key...
              </div>
            ) : (
              <button
                className="text-[9px] text-neutral-500 hover:text-neutral-300 transition-colors"
                onClick={() => setListeningIdx(idx)}
              >
                + key
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        className="text-[10px] text-neutral-500 hover:text-neutral-300 text-left transition-colors"
        onClick={addAction}
      >
        + Add action
      </button>
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
    case "digital_write":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Digital Write</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Pin</span>
            <input
              type="number"
              value={typeof data.pin === "number" ? data.pin : 13}
              onChange={(e) => onUpdateData({ pin: Number(e.target.value) })}
              className={numInputClass + " !w-16"}
              min={0}
              max={53}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Value</span>
            <select
              value={typeof data.value === "string" ? data.value : "HIGH"}
              onChange={(e) => onUpdateData({ value: e.target.value })}
              className={selectClass + " !w-20"}
            >
              <option value="HIGH">HIGH</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        </div>
      );

    case "digital_read":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Digital Read</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Pin</span>
            <input
              type="number"
              value={typeof data.pin === "number" ? data.pin : 2}
              onChange={(e) => onUpdateData({ pin: Number(e.target.value) })}
              className={numInputClass + " !w-16"}
              min={0}
              max={53}
            />
          </div>
        </div>
      );

    case "pin_mode":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Pin Mode</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Pin</span>
            <input
              type="number"
              value={typeof data.pin === "number" ? data.pin : 13}
              onChange={(e) => onUpdateData({ pin: Number(e.target.value) })}
              className={numInputClass + " !w-16"}
              min={0}
              max={53}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Mode</span>
            <select
              value={typeof data.mode === "string" ? data.mode : "OUTPUT"}
              onChange={(e) => onUpdateData({ mode: e.target.value })}
              className={selectClass + " !w-24"}
            >
              <option value="INPUT">INPUT</option>
              <option value="OUTPUT">OUTPUT</option>
              <option value="INPUT_PULLUP">INPUT_PULLUP</option>
            </select>
          </div>
        </div>
      );

    case "delay":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Delay</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Milliseconds</span>
            <input
              type="number"
              value={typeof data.ms === "number" ? data.ms : 1000}
              onChange={(e) => onUpdateData({ ms: Number(e.target.value) })}
              className={numInputClass + " !w-20"}
              min={0}
            />
          </div>
        </div>
      );

    case "serial_begin":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Serial Begin</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Baud Rate</span>
            <select
              value={typeof data.baudRate === "number" ? data.baudRate : 9600}
              onChange={(e) => onUpdateData({ baudRate: Number(e.target.value) })}
              className={selectClass + " !w-20"}
            >
              <option value={300}>300</option>
              <option value={1200}>1200</option>
              <option value={2400}>2400</option>
              <option value={4800}>4800</option>
              <option value={9600}>9600</option>
              <option value={19200}>19200</option>
              <option value={38400}>38400</option>
              <option value={57600}>57600</option>
              <option value={115200}>115200</option>
            </select>
          </div>
        </div>
      );

    case "comparison":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Comparison</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Operator</span>
            <select
              value={typeof data.operator === "string" ? data.operator : "=="}
              onChange={(e) => onUpdateData({ operator: e.target.value })}
              className={selectClass + " !w-16"}
            >
              <option value="==">==</option>
              <option value="!=">!=</option>
              <option value="<">&lt;</option>
              <option value=">">&gt;</option>
              <option value="<=">&lt;=</option>
              <option value=">=">&gt;=</option>
            </select>
          </div>
        </div>
      );

    case "logic_gate":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Logic Gate</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Gate</span>
            <select
              value={typeof data.gate === "string" ? data.gate : "AND"}
              onChange={(e) => onUpdateData({ gate: e.target.value })}
              className={selectClass + " !w-16"}
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
              <option value="NOT">NOT</option>
              <option value="XOR">XOR</option>
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

    case "variable":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Variable</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Name</span>
            <input
              type="text"
              value={typeof data.name === "string" ? data.name : "myVar"}
              onChange={(e) => onUpdateData({ name: e.target.value })}
              className={numInputClass + " !w-24"}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Type</span>
            <select
              value={typeof data.dataType === "string" ? data.dataType : "integer"}
              onChange={(e) => onUpdateData({ dataType: e.target.value })}
              className={selectClass + " !w-20"}
            >
              <option value="integer">int</option>
              <option value="float">float</option>
              <option value="boolean">bool</option>
              <option value="string">String</option>
            </select>
          </div>
        </div>
      );

    case "constant":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Constant</Label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Value</span>
            <input
              type="text"
              value={data.value != null ? String(data.value) : "0"}
              onChange={(e) => onUpdateData({ value: e.target.value })}
              className={numInputClass + " !w-20"}
            />
          </div>
        </div>
      );

    case "code_block":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="mb-0.5">Code Block</Label>
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

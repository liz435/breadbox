import {
  useRef,
  useCallback,
  useEffect,
  useState,
} from "react";
import type { GraphNode as GraphNodeType, Port } from "@dreamer/schemas";
import { useGraph } from "@/store/graph-context";
import { GraphNode } from "./graph-node";
import { GraphEdge, PendingEdge } from "./graph-edge";
import {
  getGraphCamera,
  setGraphCamera,
  graphZoomAtPoint,
} from "./graph-camera";
import { graphInteractionActor } from "./graph-interaction-machine";
import { getPortColor } from "./port-colors";
import { arePortsCompatible } from "@dreamer/schemas";
import { createGraphNode } from "./node-factory";
import { wouldCreateCycle } from "./evaluate";
import { GraphMinimap } from "./graph-minimap";
import { NodeSearch } from "./node-search";
import { useProject } from "@/project/project-context";
import { uploadProjectAsset } from "@/project/api-client";
import { API_ORIGIN } from "@dreamer/config";
import type { GraphNodeType as GraphNodeTypeEnum } from "@dreamer/schemas";

type PendingConnection = {
  fromNodeId: string;
  fromPortId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
};

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, send } = useGraph();
  const { projectId } = useProject();
  const [camera, setLocalCamera] = useState(getGraphCamera);
  const [pendingConn, setPendingConn] = useState<PendingConnection | null>(
    null
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const dragStartRef = useRef<{ nodeX: number; nodeY: number; mouseX: number; mouseY: number } | null>(null);

  // Sync camera state for re-render
  const syncCamera = useCallback(() => {
    setLocalCamera({ ...getGraphCamera() });
  }, []);

  // ── Wheel: zoom/pan ──────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = container!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        const cam = getGraphCamera();
        const zoomFactor = 1 - e.deltaY * 0.01;
        graphZoomAtPoint(sx, sy, cam.zoom * zoomFactor);
      } else {
        const cam = getGraphCamera();
        setGraphCamera({
          offsetX: cam.offsetX - e.deltaX,
          offsetY: cam.offsetY - e.deltaY,
          zoom: cam.zoom,
        });
      }
      syncCamera();
    }
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [syncCamera]);

  // ── Mouse move/up for dragging + connecting ───────────────────────────────
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const snap = graphInteractionActor.getSnapshot();

      if (snap.value === "draggingNode") {
        const nodeId = snap.context.nodeId;
        if (!nodeId || !dragStartRef.current) return;
        const cam = getGraphCamera();
        const dx = (e.clientX - dragStartRef.current.mouseX) / cam.zoom;
        const dy = (e.clientY - dragStartRef.current.mouseY) / cam.zoom;
        send({
          type: "MOVE_NODE",
          nodeId,
          x: dragStartRef.current.nodeX + dx,
          y: dragStartRef.current.nodeY + dy,
        });
      }

      if (snap.value === "connecting" && pendingConn) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cam = getGraphCamera();
        const toX = (e.clientX - rect.left - cam.offsetX) / cam.zoom;
        const toY = (e.clientY - rect.top - cam.offsetY) / cam.zoom;
        setPendingConn((prev) => (prev ? { ...prev, toX, toY } : null));
      }

      if (snap.value === "panning") {
        const cam = getGraphCamera();
        const dx = e.clientX - snap.context.lastScreenX;
        const dy = e.clientY - snap.context.lastScreenY;
        setGraphCamera({
          offsetX: cam.offsetX + dx,
          offsetY: cam.offsetY + dy,
          zoom: cam.zoom,
        });
        graphInteractionActor.send({
          type: "UPDATE_PAN",
          screenX: e.clientX,
          screenY: e.clientY,
        });
        syncCamera();
      }
    }

    function handleMouseUp(e: MouseEvent) {
      const snap = graphInteractionActor.getSnapshot();

      if (snap.value === "connecting" && pendingConn) {
        // Check if mouse is over a compatible port
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const portEl = target?.closest("[data-port-id]") as HTMLElement | null;
        if (portEl) {
          const targetNodeId = portEl.dataset.portNodeId;
          const targetPortId = portEl.dataset.portId;
          const targetDirection = portEl.dataset.portDirection;
          const targetDataType = portEl.dataset.portDataType;

          if (
            targetNodeId &&
            targetPortId &&
            targetDirection === "in" &&
            targetNodeId !== pendingConn.fromNodeId
          ) {
            // Check type compatibility
            const sourceNode = state.nodes[pendingConn.fromNodeId];
            const sourcePort = sourceNode?.ports.find(
              (p) => p.id === pendingConn.fromPortId
            );
            if (
              sourcePort &&
              targetDataType &&
              arePortsCompatible(
                sourcePort.dataType,
                targetDataType as Port["dataType"]
              ) &&
              !wouldCreateCycle(
                state.nodes,
                state.edges,
                pendingConn.fromNodeId,
                targetNodeId
              )
            ) {
              send({
                type: "ADD_EDGE",
                edge: {
                  id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  sourceNodeId: pendingConn.fromNodeId,
                  sourcePortId: pendingConn.fromPortId,
                  targetNodeId,
                  targetPortId,
                },
              });
            }
          }
        }
        setPendingConn(null);
      }

      if (snap.value !== "idle") {
        graphInteractionActor.send({ type: "RELEASE" });
        dragStartRef.current = null;
      }
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [send, state.nodes, pendingConn, syncCamera]);

  // ── Node mouse down ──────────────────────────────────────────────────────
  const handleNodeMouseDown = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      send({ type: "SELECT_NODES", nodeIds: [nodeId] });
      send({ type: "SNAPSHOT" });

      const node = state.nodes[nodeId];
      if (node) {
        dragStartRef.current = {
          nodeX: node.x,
          nodeY: node.y,
          mouseX: e.clientX,
          mouseY: e.clientY,
        };
      }
      graphInteractionActor.send({
        type: "START_DRAG_NODE",
        nodeId,
      });
    },
    [send, state.nodes]
  );

  // ── Connection start ─────────────────────────────────────────────────────
  const handleConnectionStart = useCallback(
    (nodeId: string, portId: string) => {
      const node = state.nodes[nodeId];
      if (!node) return;
      const port = node.ports.find((p) => p.id === portId);
      if (!port || port.direction !== "out") return;

      // Estimate port position
      const outputPorts = node.ports.filter((p) => p.direction === "out");
      const idx = outputPorts.indexOf(port);
      const headerH = 28;
      const portStartY = headerH + 10;
      const portSpacing = 20;

      setPendingConn({
        fromNodeId: nodeId,
        fromPortId: portId,
        fromX: node.x + node.width,
        fromY: node.y + portStartY + idx * portSpacing,
        toX: node.x + node.width + 20,
        toY: node.y + portStartY + idx * portSpacing,
        color: getPortColor(port.dataType),
      });
    },
    [state.nodes]
  );

  // ── Canvas background mouse down ─────────────────────────────────────────
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        // Middle click or alt+click → pan
        graphInteractionActor.send({
          type: "START_PAN",
          screenX: e.clientX,
          screenY: e.clientY,
        });
      } else if (e.button === 0) {
        send({ type: "CLEAR_SELECTION" });
        setContextMenu(null);
      }
    },
    [send]
  );

  // ── Context menu ─────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const addNodeFromMenu = useCallback(
    (type: GraphNodeType["type"]) => {
      if (!contextMenu) return;
      const cam = getGraphCamera();
      const worldX = (contextMenu.x - cam.offsetX) / cam.zoom;
      const worldY = (contextMenu.y - cam.offsetY) / cam.zoom;

      send({
        type: "ADD_NODE",
        node: createGraphNode(type, { x: worldX, y: worldY }),
      });
      setContextMenu(null);
    },
    [send, contextMenu]
  );

  // ── Data change (from node content editors) ────────────────────────────────
  const handleDataChange = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      send({ type: "UPDATE_NODE", nodeId, patch });
    },
    [send]
  );

  // ── Edge click ────────────────────────────────────────────────────────────
  const handleEdgeClick = useCallback(
    (edgeId: string) => {
      send({ type: "SELECT_EDGES", edgeIds: [edgeId] });
    },
    [send]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Delete" || e.key === "Backspace") {
        for (const nodeId of state.selectedNodeIds) {
          send({ type: "REMOVE_NODE", nodeId });
        }
        for (const edgeId of state.selectedEdgeIds) {
          send({ type: "REMOVE_EDGE", edgeId });
        }
      }
      if (e.key === "Escape") {
        send({ type: "CLEAR_SELECTION" });
        setContextMenu(null);
        setShowSearch(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
        setContextMenu(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [send, state.selectedNodeIds, state.selectedEdgeIds]);

  // ── Drop zone ─────────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cam = getGraphCamera();
      const worldX = (e.clientX - rect.left - cam.offsetX) / cam.zoom;
      const worldY = (e.clientY - rect.top - cam.offsetY) / cam.zoom;

      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        let nodeType: GraphNodeType["type"] | null = null;
        let isMediaFile = false;

        if (
          file.type.startsWith("image/") ||
          ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)
        ) {
          nodeType = "sprite";
          isMediaFile = true;
        } else if (["glsl", "wgsl", "frag", "vert", "hlsl"].includes(ext)) {
          nodeType = "shader";
        } else if (
          file.type.startsWith("audio/") ||
          ["mp3", "wav", "ogg", "flac", "aac"].includes(ext)
        ) {
          nodeType = "audio";
          isMediaFile = true;
        } else if (
          file.type.startsWith("video/") ||
          ["mp4", "webm", "mov", "avi"].includes(ext)
        ) {
          nodeType = "video";
          isMediaFile = true;
        } else if (["ts", "js", "tsx", "jsx"].includes(ext)) {
          nodeType = "code";
        } else if (["json", "yaml", "yml", "txt", "md"].includes(ext)) {
          nodeType = "text";
        }

        if (!nodeType) continue;

        if (isMediaFile) {
          // Upload media file, then create node with the returned URI
          const capturedType = nodeType;
          uploadProjectAsset(projectId, file)
            .then((result) => {
              send({
                type: "ADD_NODE",
                node: createGraphNode(capturedType, {
                  name: file.name,
                  x: worldX,
                  y: worldY,
                  data: {
                    fileName: file.name,
                    fileType: file.type,
                    uri: `${API_ORIGIN}${result.uri}`,
                  },
                }),
              });
            })
            .catch(() => {
              // Fallback: create node without URI
              send({
                type: "ADD_NODE",
                node: createGraphNode(capturedType, {
                  name: file.name,
                  x: worldX,
                  y: worldY,
                  data: { fileName: file.name, fileType: file.type },
                }),
              });
            });
        } else {
          send({
            type: "ADD_NODE",
            node: createGraphNode(nodeType, {
              name: file.name,
              x: worldX,
              y: worldY,
              data: { fileName: file.name, fileType: file.type },
            }),
          });
        }
      }
    },
    [send, projectId]
  );

  const handleSearchSelect = useCallback(
    (type: GraphNodeTypeEnum) => {
      const cam = getGraphCamera();
      const rect = containerRef.current?.getBoundingClientRect();
      const centerX = rect ? rect.width / 2 : 400;
      const centerY = rect ? rect.height / 2 : 300;
      const worldX = (centerX - cam.offsetX) / cam.zoom;
      const worldY = (centerY - cam.offsetY) / cam.zoom;

      send({
        type: "ADD_NODE",
        node: createGraphNode(type, { x: worldX, y: worldY }),
      });
      setShowSearch(false);
    },
    [send]
  );

  const nodeTypes: GraphNodeType["type"][] = [
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
  ];

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-neutral-950"
      onMouseDown={handleCanvasMouseDown}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: `${20 * camera.zoom}px ${20 * camera.zoom}px`,
          backgroundPosition: `${camera.offsetX}px ${camera.offsetY}px`,
        }}
      />

      {/* Transform container */}
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${camera.offsetX}px, ${camera.offsetY}px) scale(${camera.zoom})`,
        }}
      >
        {/* SVG layer for edges */}
        <svg className="absolute inset-0 overflow-visible pointer-events-none">
          <g className="pointer-events-auto">
            {Object.values(state.edges).map((edge) => (
              <GraphEdge
                key={edge.id}
                edge={edge}
                nodes={state.nodes}
                isSelected={state.selectedEdgeIds.has(edge.id)}
                onClick={handleEdgeClick}
              />
            ))}
            {pendingConn && (
              <PendingEdge
                fromX={pendingConn.fromX}
                fromY={pendingConn.fromY}
                toX={pendingConn.toX}
                toY={pendingConn.toY}
                color={pendingConn.color}
              />
            )}
          </g>
        </svg>

        {/* Node layer */}
        {Object.values(state.nodes).map((node) => (
          <GraphNode
            key={node.id}
            node={node}
            isSelected={state.selectedNodeIds.has(node.id)}
            zoom={camera.zoom}
            onMouseDown={handleNodeMouseDown}
            onConnectionStart={handleConnectionStart}
            onDataChange={handleDataChange}
          />
        ))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="absolute z-50 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl py-1 min-w-40"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
            Add Node
          </div>
          {nodeTypes.map((type) => (
            <button
              key={type}
              className="w-full text-left px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 transition-colors"
              onClick={() => addNodeFromMenu(type)}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Node search (Ctrl+K) */}
      {showSearch && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
          <NodeSearch
            onSelect={handleSearchSelect}
            onClose={() => setShowSearch(false)}
          />
        </div>
      )}

      {/* Minimap */}
      <div className="absolute bottom-10 right-2 z-10 pointer-events-auto">
        <GraphMinimap />
      </div>

      {/* Status bar */}
      <div className="absolute bottom-2 left-2 text-[10px] text-neutral-500 select-none pointer-events-none">
        {Object.keys(state.nodes).length} nodes &middot;{" "}
        {Object.keys(state.edges).length} edges &middot;{" "}
        {Math.round(camera.zoom * 100)}%
      </div>
    </div>
  );
}

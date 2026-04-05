import { useEffect, useCallback, useRef } from "react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewApi,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import "./app.css";
import { ProjectPanel } from "./panels/project-panel";
import Inspector from "./panels/inspector";
import { GraphPanel } from "./graph/graph-panel";
import { ViewportPanel } from "./viewport/viewport-panel";
import { BreadboardPanel } from "./breadboard/breadboard-panel";
import { SerialMonitor } from "./panels/serial-monitor";
import { PinInspector } from "./panels/pin-inspector";
import { BottomToolbar } from "./toolbar/bottom-toolbar";
import { SceneContext, useScene } from "./store/scene-context";
import { GraphContext, useGraph } from "./store/graph-context";
import { BoardContext, useBoard } from "./store/board-context";
import { DockviewContext } from "./store/dockview-context";
import { ProjectLoader } from "./project/project-loader";
import { useGraphPersistence } from "./project/use-graph-persistence";
import { SketchEditor } from "./editor/sketch-editor";
import { useProject } from "./project/project-context";
import { syncCodegenToBoard } from "./store/graph-scene-bridge";

// Dockview panel wrappers
function ProjectFilesPanel(_props: IDockviewPanelProps) {
  return <ProjectPanel />;
}

function BreadboardDockPanel(_props: IDockviewPanelProps) {
  return <BreadboardPanel />;
}

function InspectorPanel(_props: IDockviewPanelProps) {
  return <Inspector />;
}

function GraphEditorPanel(_props: IDockviewPanelProps) {
  return <GraphPanel />;
}

function ViewportPanelWrapper(_props: IDockviewPanelProps) {
  return <ViewportPanel />;
}

function SerialMonitorPanel(_props: IDockviewPanelProps) {
  return <SerialMonitor />;
}

function PinInspectorPanel(_props: IDockviewPanelProps) {
  return <PinInspector />;
}

function SketchEditorPanel(_props: IDockviewPanelProps) {
  return <SketchEditor />;
}

const components = {
  projectFiles: ProjectFilesPanel,
  breadboard: BreadboardDockPanel,
  inspector: InspectorPanel,
  graph: GraphEditorPanel,
  viewport: ViewportPanelWrapper,
  serialMonitor: SerialMonitorPanel,
  pinInspector: PinInspectorPanel,
  sketchEditor: SketchEditorPanel,
};

function AppInner() {
  const { state, send } = useScene();
  const { state: boardState, send: boardSend } = useBoard();
  const { state: graphState } = useGraph();
  const project = useProject();
  useGraphPersistence();
  const dockviewApiRef = useRef<DockviewApi | null>(null);
  const boardHydratedRef = useRef(false);

  // Hydrate board state from project file on first render
  useEffect(() => {
    if (boardHydratedRef.current) return;
    boardHydratedRef.current = true;
    const pf = project.projectFile;
    if (pf.boardState) {
      boardSend({ type: "LOAD_BOARD", state: pf.boardState });
    }
  }, [project.projectFile, boardSend]);

  // Sync codegen to board whenever graph nodes/edges change
  const prevNodesRef = useRef(graphState.nodes);
  const prevEdgesRef = useRef(graphState.edges);
  useEffect(() => {
    if (
      graphState.nodes !== prevNodesRef.current ||
      graphState.edges !== prevEdgesRef.current
    ) {
      prevNodesRef.current = graphState.nodes;
      prevEdgesRef.current = graphState.edges;
      syncCodegenToBoard(graphState.nodes, graphState.edges, boardSend);
    }
  }, [graphState.nodes, graphState.edges, boardSend]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // Undo / Redo (both scene + board)
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        send({ type: e.shiftKey ? "REDO" : "UNDO" });
        boardSend({ type: e.shiftKey ? "REDO" : "UNDO" });
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (boardState.selectedId) {
          boardSend({ type: "REMOVE_COMPONENT", id: boardState.selectedId });
        } else if (state.selectedId) {
          send({ type: "REMOVE", id: state.selectedId });
        }
      }
      if (e.key === "Escape") {
        send({ type: "SELECT", id: null });
        boardSend({ type: "SELECT", id: null });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.selectedId, boardState.selectedId, send, boardSend]);

  const LAYOUT_STORAGE_KEY = "dreamer:dockview-layout";

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    dockviewApiRef.current = api;

    // Try restoring saved layout from localStorage
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try {
        const layout = JSON.parse(saved) as ReturnType<DockviewApi["toJSON"]>;
        api.fromJSON(layout);
        return setupPersistence(api);
      } catch {
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
      }
    }

    // Default layout: 20% / 60% / 20%
    const totalWidth = api.width;

    const projectFilesPanel = api.addPanel({
      id: "projectFiles",
      component: "projectFiles",
      title: "Project",
    });

    const canvasPanel = api.addPanel({
      id: "breadboard",
      component: "breadboard",
      title: "Breadboard",
      position: { referencePanel: projectFilesPanel, direction: "right" },
    });

    const graphPanel = api.addPanel({
      id: "graph",
      component: "graph",
      title: "Graph",
      position: { referencePanel: canvasPanel, direction: "right" },
    });

    api.addPanel({
      id: "sketchEditor",
      component: "sketchEditor",
      title: "Sketch",
      position: { referencePanel: graphPanel, direction: "within" },
    });

    const inspectorPanel = api.addPanel({
      id: "inspector",
      component: "inspector",
      title: "Inspector",
      position: { referencePanel: graphPanel, direction: "right" },
    });

    // Pin Inspector as a tab alongside Inspector
    api.addPanel({
      id: "pinInspector",
      component: "pinInspector",
      title: "Pin Inspector",
      position: { referencePanel: inspectorPanel, direction: "within" },
    });

    // Serial Monitor below breadboard
    api.addPanel({
      id: "serialMonitor",
      component: "serialMonitor",
      title: "Serial Monitor",
      position: { referencePanel: canvasPanel, direction: "below" },
    });

    projectFilesPanel.api.setSize({ width: totalWidth * 0.15 });
    canvasPanel.api.setSize({ width: totalWidth * 0.35 });
    graphPanel.api.setSize({ width: totalWidth * 0.35 });
    api.getPanel("inspector")?.api.setSize({ width: totalWidth * 0.15 });

    setupPersistence(api);
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function setupPersistence(api: DockviewApi) {
    api.onDidLayoutChange(() => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const layout = api.toJSON();
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
      }, 300);
    });
  }

  return (
    <DockviewContext.Provider value={dockviewApiRef}>
      <div className="flex flex-col w-full h-full">
        <div className="relative flex-1 min-h-0 dockview-theme-abyss">
          <DockviewReact
            onReady={onReady}
            components={components}
            className="h-full"
          />
          <BottomToolbar />
        </div>
      </div>
    </DockviewContext.Provider>
  );
}

export default function App() {
  return (
    <ProjectLoader>
      <BoardContext.Provider>
        <SceneContext.Provider>
          <GraphContext.Provider>
            <AppInner />
          </GraphContext.Provider>
        </SceneContext.Provider>
      </BoardContext.Provider>
    </ProjectLoader>
  );
}

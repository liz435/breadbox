import { useEffect, useCallback, useRef } from "react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewApi,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import "./app.css";
import Canvas from "./canvas/canvas";
import { ProjectPanel } from "./panels/project-panel";
import Inspector from "./panels/inspector";
import { GraphPanel } from "./graph/graph-panel";
import { CharacterPanel } from "./character/character-panel";
import { ViewportPanel } from "./viewport/viewport-panel";
import { BottomToolbar } from "./toolbar/bottom-toolbar";
import { SceneContext, useScene } from "./store/scene-context";
import { GraphContext } from "./store/graph-context";
import { DockviewContext } from "./store/dockview-context";
import { ProjectLoader } from "./project/project-loader";
import { useGraphPersistence } from "./project/use-graph-persistence";

// Dockview panel wrappers
function ProjectFilesPanel(_props: IDockviewPanelProps) {
  return <ProjectPanel />;
}

function CanvasPanel(_props: IDockviewPanelProps) {
  return <Canvas />;
}

function InspectorPanel(_props: IDockviewPanelProps) {
  return <Inspector />;
}

function GraphEditorPanel(_props: IDockviewPanelProps) {
  return <GraphPanel />;
}

function CharacterCreatorPanel(_props: IDockviewPanelProps) {
  return <CharacterPanel />;
}

function ViewportPanelWrapper(_props: IDockviewPanelProps) {
  return <ViewportPanel />;
}

const components = {
  projectFiles: ProjectFilesPanel,
  canvas: CanvasPanel,
  inspector: InspectorPanel,
  graph: GraphEditorPanel,
  character: CharacterCreatorPanel,
  viewport: ViewportPanelWrapper,
};

function AppInner() {
  const { state, send } = useScene();
  useGraphPersistence();
  const dockviewApiRef = useRef<DockviewApi | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        send({ type: e.shiftKey ? "REDO" : "UNDO" });
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedId) {
          send({ type: "REMOVE", id: state.selectedId });
        }
      }
      if (e.key === "Escape") {
        send({ type: "SELECT", id: null });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.selectedId, send]);

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
      id: "canvas",
      component: "canvas",
      title: "Canvas",
      position: { referencePanel: projectFilesPanel, direction: "right" },
    });

    const graphPanel = api.addPanel({
      id: "graph",
      component: "graph",
      title: "Graph",
      position: { referencePanel: canvasPanel, direction: "right" },
    });

    const inspectorPanel = api.addPanel({
      id: "inspector",
      component: "inspector",
      title: "Inspector",
      position: { referencePanel: graphPanel, direction: "right" },
    });

    api.addPanel({
      id: "character",
      component: "character",
      title: "Character",
      position: { referencePanel: inspectorPanel, direction: "within" },
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
      <SceneContext.Provider>
        <GraphContext.Provider>
          <AppInner />
        </GraphContext.Provider>
      </SceneContext.Provider>
    </ProjectLoader>
  );
}

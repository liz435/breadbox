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
import SpriteList from "./panels/sprite-list";
import Inspector from "./panels/inspector";
import { BottomToolbar } from "./toolbar/bottom-toolbar";
import { SceneContext, useScene } from "./store/scene-context";
import { ProjectLoader } from "./project/project-loader";

// Dockview panel wrappers
function SpriteListPanel(_props: IDockviewPanelProps) {
  return <SpriteList />;
}

function CanvasPanel(_props: IDockviewPanelProps) {
  return <Canvas />;
}

function InspectorPanel(_props: IDockviewPanelProps) {
  return <Inspector />;
}

const components = {
  spriteList: SpriteListPanel,
  canvas: CanvasPanel,
  inspector: InspectorPanel,
};

function AppInner() {
  const { state, send } = useScene();

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

    const spriteListPanel = api.addPanel({
      id: "spriteList",
      component: "spriteList",
      title: "Sprites",
    });

    const canvasPanel = api.addPanel({
      id: "canvas",
      component: "canvas",
      title: "Canvas",
      position: { referencePanel: spriteListPanel, direction: "right" },
    });

    api.addPanel({
      id: "inspector",
      component: "inspector",
      title: "Inspector",
      position: { referencePanel: canvasPanel, direction: "right" },
    });

    spriteListPanel.api.setSize({ width: totalWidth * 0.2 });
    api.getPanel("inspector")?.api.setSize({ width: totalWidth * 0.2 });

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
  );
}

export default function App() {
  return (
    <ProjectLoader>
      <SceneContext.Provider>
        <AppInner />
      </SceneContext.Provider>
    </ProjectLoader>
  );
}

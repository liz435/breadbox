import React, { useCallback, useState } from "react";
import { BreadboardCanvas } from "./breadboard-canvas";
import { getCamera, setCamera } from "./breadboard-camera";

function ZoomControls({ onZoomChange }: { onZoomChange: () => void }) {
  const handleZoomIn = useCallback(() => {
    const cam = getCamera();
    const newZoom = Math.min(cam.zoom * 1.25, 5);
    setCamera({ zoom: newZoom });
    onZoomChange();
  }, [onZoomChange]);

  const handleZoomOut = useCallback(() => {
    const cam = getCamera();
    const newZoom = Math.max(cam.zoom / 1.25, 0.2);
    setCamera({ zoom: newZoom });
    onZoomChange();
  }, [onZoomChange]);

  const handleReset = useCallback(() => {
    setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });
    onZoomChange();
  }, [onZoomChange]);

  return (
    <div className="absolute bottom-3 right-3 flex flex-col gap-1">
      <button
        type="button"
        onClick={handleZoomIn}
        className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 text-lg font-bold hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 shadow-md"
        title="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        onClick={handleZoomOut}
        className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 text-lg font-bold hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 shadow-md"
        title="Zoom out"
      >
        −
      </button>
      <button
        type="button"
        onClick={handleReset}
        className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 shadow-md"
        title="Reset zoom"
      >
        1:1
      </button>
    </div>
  );
}

function BreadboardPanelInner() {
  // Force re-render when zoom changes so the canvas picks up the new camera state
  const [, setTick] = useState(0);
  const handleZoomChange = useCallback(() => setTick((t) => t + 1), []);

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <div className="relative flex-1">
        <BreadboardCanvas />
        <ZoomControls onZoomChange={handleZoomChange} />
      </div>
    </div>
  );
}

export const BreadboardPanel = React.memo(BreadboardPanelInner);

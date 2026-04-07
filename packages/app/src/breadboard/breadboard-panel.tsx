import React, { useCallback, useState } from "react";
import { BreadboardCanvas } from "./breadboard-canvas";
import { getCamera, setCamera } from "./breadboard-camera";

function ZoomControls({
  onZoomChange,
  panMode,
  onTogglePan,
}: {
  onZoomChange: () => void;
  panMode: boolean;
  onTogglePan: () => void;
}) {
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

  const btnBase =
    "flex h-8 w-8 items-center justify-center rounded-md text-lg font-bold border shadow-md";
  const btnNormal =
    "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:bg-zinc-600 border-zinc-700";
  const btnActive =
    "bg-zinc-600 text-white border-zinc-500 ring-1 ring-zinc-400";

  return (
    <div className="absolute bottom-3 right-3 flex flex-col gap-1">
      <button
        type="button"
        onClick={handleZoomIn}
        className={`${btnBase} ${btnNormal}`}
        title="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        onClick={handleZoomOut}
        className={`${btnBase} ${btnNormal}`}
        title="Zoom out"
      >
        −
      </button>
      <button
        type="button"
        onClick={handleReset}
        className={`${btnBase} ${btnNormal} !text-xs`}
        title="Reset zoom"
      >
        1:1
      </button>
      <button
        type="button"
        onClick={onTogglePan}
        className={`${btnBase} ${panMode ? btnActive : btnNormal} !text-sm`}
        title={panMode ? "Pan mode (active)" : "Pan mode"}
      >
        ✋
      </button>
    </div>
  );
}

function BreadboardPanelInner() {
  const [tick, setTick] = useState(0);
  const [panMode, setPanMode] = useState(false);
  const handleZoomChange = useCallback(() => setTick((t) => t + 1), []);
  const handleTogglePan = useCallback(() => setPanMode((p) => !p), []);

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <div className="relative flex-1">
        <BreadboardCanvas zoomTick={tick} panMode={panMode} />
        <ZoomControls
          onZoomChange={handleZoomChange}
          panMode={panMode}
          onTogglePan={handleTogglePan}
        />
      </div>
    </div>
  );
}

export const BreadboardPanel = React.memo(BreadboardPanelInner);

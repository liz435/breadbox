import { useRef, useCallback, useEffect, type RefObject } from "react";
import { Application, useApplication } from "@pixi/react";

import { useScene } from "@/store/scene-context";
import { createSprite } from "@/store/scene";
import { loadImageFromFile } from "@/utils/image-loader";
import { getCamera, zoomAtPoint, setCamera, setSpaceHeld } from "@/canvas/camera";
import { interactionActor } from "@/interaction/interaction-machine";
import { PixiScene } from "./pixi-scene";

/**
 * PixiJS's ResizePlugin only listens for window resize events.
 * Dockview panel drags resize the container without a window resize,
 * so we observe the container and call app.resize() which reads
 * clientWidth/clientHeight from the resizeTo element and re-renders.
 */
function CanvasResizer({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const { app } = useApplication();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => app.resize());
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [app, containerRef]);

  return null;
}

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { send } = useScene();

  // Wheel zoom/pan + keyboard listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = container!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom or Ctrl+scroll → zoom at cursor
        const cam = getCamera();
        const zoomFactor = 1 - e.deltaY * 0.01;
        zoomAtPoint(sx, sy, cam.zoom * zoomFactor);
      } else {
        // Two-finger scroll → pan
        const cam = getCamera();
        setCamera({
          offsetX: cam.offsetX - e.deltaX,
          offsetY: cam.offsetY - e.deltaY,
          zoom: cam.zoom,
        });
      }
    }
    container.addEventListener("wheel", handleWheel, { passive: false });

    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        setSpaceHeld(false);
        const snapshot = interactionActor.getSnapshot();
        if (snapshot.value === "panning") {
          interactionActor.send({ type: "RELEASE" });
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files) return;
      for (const file of Array.from(files)) {
        if (file.type.startsWith("image/")) {
          const img = await loadImageFromFile(file);
          send({ type: "ADD_SPRITE", sprite: createSprite(img, file.name) });
        }
      }
    },
    [send]
  );

  return (
    <div
      ref={containerRef}
      className="pixi-container"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Application resizeTo={containerRef} background={0x252525} resolution={window.devicePixelRatio} autoDensity antialias>
        <CanvasResizer containerRef={containerRef} />
        <PixiScene />
      </Application>
    </div>
  );
}

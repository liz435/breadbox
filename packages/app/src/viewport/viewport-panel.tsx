import { useRef, useEffect } from "react";
import { createViewportRenderer, type ViewportRenderer } from "./viewport-renderer";

export function ViewportPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ViewportRenderer | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const vr = createViewportRenderer();
    vr.mount(el);
    rendererRef.current = vr;

    // Resize when panel is resized (dockview drag, window resize, etc.)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          vr.resize(width, height);
        }
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      vr.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#1a1a2e] overflow-hidden"
    />
  );
}

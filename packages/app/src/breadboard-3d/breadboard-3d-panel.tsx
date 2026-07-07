// ── 3D Breadboard panel ─────────────────────────────────────────────────────
//
// Thin dockview-facing wrapper. The actual scene (and the three.js bundle it
// drags in) is code-split behind React.lazy so opening the app costs nothing
// until this tab is first shown.

import { Suspense, lazy } from "react"

const SceneRoot = lazy(() =>
  import("./scene-root").then((module) => ({ default: module.SceneRoot })),
)

export function Breadboard3dPanel() {
  return (
    <div className="relative h-full w-full">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            Loading 3D view…
          </div>
        }
      >
        <SceneRoot />
      </Suspense>
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/40 px-2 py-0.5 text-[11px] text-white/80">
        drag to orbit · right-drag to pan · scroll to zoom
      </div>
    </div>
  )
}

// ── 3D Breadboard panel ─────────────────────────────────────────────────────
//
// Thin dockview-facing wrapper. The actual view (and the three.js bundle it
// drags in) is code-split behind React.lazy so opening the app costs nothing
// until this tab is first shown.

import { Suspense, lazy } from "react"

const Breadboard3dView = lazy(() =>
  import("./view").then((module) => ({ default: module.Breadboard3dView })),
)

export function Breadboard3dPanel() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-neutral-500">
          Loading 3D view…
        </div>
      }
    >
      <Breadboard3dView />
    </Suspense>
  )
}

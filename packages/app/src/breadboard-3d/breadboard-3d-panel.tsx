// ── 3D Breadboard panel ─────────────────────────────────────────────────────
//
// Thin dockview-facing wrapper. The actual view (and the three.js bundle it
// drags in) is code-split behind React.lazy so opening the app costs nothing
// until this tab is first shown.

import { Suspense, lazy } from "react"
import { Scene3dLoading } from "./scene-loading"

const Breadboard3dView = lazy(() =>
  import("./view").then((module) => ({ default: module.Breadboard3dView })),
)

export function Breadboard3dPanel() {
  return (
    <Suspense fallback={<Scene3dLoading label="Loading 3D view…" />}>
      <Breadboard3dView />
    </Suspense>
  )
}

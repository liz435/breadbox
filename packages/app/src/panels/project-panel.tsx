import { Suspense, lazy } from "react"
import { ProjectSelector } from "./project-selector"
import { ComponentPalette } from "@/breadboard/component-palette"
import { CustomPartEditor } from "./custom-parts-panel"
import {
  useCustomPartEditor,
  closeCustomPartEditor,
} from "@/components/catalog/custom-parts-editor-store"
import { useBreadboard3dTabActive } from "@/store/breadboard-3d-tab"

// Lazy so the 3D actions panel (which pulls in scene-export's three.js
// dependencies) stays out of the main bundle alongside the rest of the
// breadboard-3d chunk.
const Components3dPanel = lazy(() =>
  import("@/breadboard-3d/components-3d-panel").then((m) => ({
    default: m.Components3dPanel,
  })),
)

export function ProjectPanel() {
  const editor = useCustomPartEditor()
  const is3dActive = useBreadboard3dTabActive()
  return (
    <div data-onboarding="components" className="h-full flex flex-col bg-card overflow-hidden">
      <div className="border-b border-border shrink-0">
        <ProjectSelector />
      </div>
      <div className="flex-1 min-h-0">
        {editor.open ? (
          <CustomPartEditor target={editor.target} onClose={closeCustomPartEditor} />
        ) : is3dActive ? (
          <Suspense fallback={null}>
            <Components3dPanel />
          </Suspense>
        ) : (
          <ComponentPalette />
        )}
      </div>
    </div>
  )
}

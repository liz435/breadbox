import { ProjectSelector } from "./project-selector"
import { ComponentPalette } from "@/breadboard/component-palette"
import { CustomPartEditor } from "./custom-parts-panel"
import {
  useCustomPartEditor,
  closeCustomPartEditor,
} from "@/components/catalog/custom-parts-editor-store"

export function ProjectPanel() {
  const editor = useCustomPartEditor()
  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      <div className="border-b border-border shrink-0">
        <ProjectSelector />
      </div>
      <div className="flex-1 min-h-0">
        {editor.open ? (
          <CustomPartEditor target={editor.target} onClose={closeCustomPartEditor} />
        ) : (
          <ComponentPalette />
        )}
      </div>
    </div>
  )
}

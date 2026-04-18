import { ProjectSelector } from "./project-selector"
import { ComponentPalette } from "@/breadboard/component-palette"

export function ProjectPanel() {
  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      <div className="border-b border-border shrink-0">
        <ProjectSelector />
      </div>
      <div className="flex-1 min-h-0">
        <ComponentPalette />
      </div>
    </div>
  )
}

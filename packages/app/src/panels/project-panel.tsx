import { ProjectSelector } from "./project-selector"
import { ProjectFiles } from "./project-files"

export function ProjectPanel() {
  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      <div className="border-b border-border shrink-0">
        <ProjectSelector />
      </div>
      <div className="flex-1 min-h-0">
        <ProjectFiles />
      </div>
    </div>
  )
}

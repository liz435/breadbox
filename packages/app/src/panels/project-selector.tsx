import { useState, useEffect, useCallback } from "react"
import { useProject } from "@/project/project-context"
import {
  listProjects,
  createProject,
  type ProjectSummary,
} from "@/project/api-client"
import { saveProjectId } from "@/project/project-context"
import { Plus, ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function ProjectSelector() {
  const { projectId, switchProject } = useProject()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const currentProject = projects.find((p) => p.id === projectId)

  const refresh = useCallback(() => {
    setIsLoading(true)
    listProjects()
      .then(setProjects)
      .catch(() => {
        // best-effort
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleSelect = useCallback(
    (id: string) => {
      if (id === projectId) {
        setIsOpen(false)
        return
      }
      saveProjectId(id)
      switchProject(id)
      setIsOpen(false)
    },
    [projectId, switchProject],
  )

  const handleCreate = useCallback(async () => {
    setIsCreating(true)
    try {
      const pf = await createProject({ name: "Untitled Project" })
      saveProjectId(pf.project.id)
      switchProject(pf.project.id)
      setIsOpen(false)
    } catch {
      // best-effort
    } finally {
      setIsCreating(false)
    }
  }, [switchProject])

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors rounded w-full"
        onClick={() => {
          if (!isOpen) refresh()
          setIsOpen((v) => !v)
        }}
      >
        <span className="flex-1 text-left truncate">
          {currentProject?.name ?? "Loading..."}
        </span>
        <ChevronDown
          className={cn(
            "size-3 text-muted-foreground transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="max-h-48 overflow-auto">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors",
                      p.id === projectId && "bg-accent text-accent-foreground",
                    )}
                    onClick={() => handleSelect(p.id)}
                  >
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.id === projectId && (
                      <span className="text-muted-foreground">current</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="border-t border-border">
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors disabled:opacity-50"
                onClick={handleCreate}
                disabled={isCreating}
              >
                {isCreating ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plus className="size-3" />
                )}
                <span>New Project</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

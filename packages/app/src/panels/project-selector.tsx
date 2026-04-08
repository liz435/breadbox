import { useState, useEffect, useCallback } from "react"
import { useProject } from "@/project/project-context"
import {
  listProjects,
  createProject,
  deleteProject,
  type ProjectSummary,
} from "@/project/api-client"
import { saveProjectId } from "@/project/project-context"
import { Plus, ChevronDown, Loader2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/toast"

export function ProjectSelector() {
  const { projectId, switchProject } = useProject()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const currentProject = projects.find((p) => p.id === projectId)

  const refresh = useCallback(() => {
    setIsLoading(true)
    listProjects()
      .then(setProjects)
      .catch(() => {
        toast.error("Failed to load project list")
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

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteProject(id)
        setConfirmDeleteId(null)
        if (id === projectId) {
          // Deleted the current project — switch to another or create new
          const remaining = projects.filter((p) => p.id !== id)
          if (remaining.length > 0) {
            saveProjectId(remaining[0].id)
            switchProject(remaining[0].id)
          } else {
            const pf = await createProject({ name: "Untitled Project" })
            saveProjectId(pf.project.id)
            switchProject(pf.project.id)
          }
        } else {
          setProjects((prev) => prev.filter((p) => p.id !== id))
        }
      } catch {
        toast.error("Failed to delete project")
      }
    },
    [projectId, projects, switchProject],
  )

  const handleCreate = useCallback(async () => {
    setIsCreating(true)
    try {
      const pf = await createProject({ name: "Untitled Project" })
      saveProjectId(pf.project.id)
      switchProject(pf.project.id)
      setIsOpen(false)
    } catch {
      toast.error("Failed to create project")
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
            onClick={() => {
              setIsOpen(false)
              setConfirmDeleteId(null)
            }}
          />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="max-h-48 overflow-auto">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-center gap-1 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors group",
                      p.id === projectId && "bg-accent text-accent-foreground",
                    )}
                  >
                    {confirmDeleteId === p.id ? (
                      <>
                        <span className="flex-1 truncate text-destructive">
                          Delete "{p.name}"?
                        </span>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 text-[10px] rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDelete(p.id)}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 text-[10px] rounded hover:bg-accent-foreground/10"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="flex-1 text-left truncate"
                          onClick={() => handleSelect(p.id)}
                        >
                          {p.name}
                        </button>
                        {p.id === projectId && (
                          <span className="text-muted-foreground">current</span>
                        )}
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDeleteId(p.id)
                          }}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </>
                    )}
                  </div>
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

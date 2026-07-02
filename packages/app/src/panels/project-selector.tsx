import { useState, useEffect, useCallback, useRef } from "react"
import { useProject } from "@/project/project-context"
import {
  listProjects,
  createProject,
  deleteProject,
  renameProject,
  type ProjectSummary,
} from "@/project/api-client"
import { saveProjectId } from "@/project/project-context"
import { Plus, ChevronDown, Loader2, Trash2, Check, Folder, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/toast"

export function ProjectSelector() {
  const { projectId, projectFile, switchProject } = useProject()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  // Escape must discard the edit, but blur always follows it — this flag
  // lets the blur handler tell an intentional cancel from a commit.
  const renameCancelledRef = useRef(false)

  // Fall back to the loaded project's name when the server-side list
  // doesn't contain it (preview mode returns `[]`, or the project was
  // just created and the list hasn't refreshed yet).
  const currentProject =
    projects.find((p) => p.id === projectId) ??
    (projectFile
      ? { id: projectId, name: projectFile.project.name }
      : null)

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

  const handleRenameCommit = useCallback(async () => {
    const id = renamingId
    if (!id) return
    setRenamingId(null)
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false
      return
    }
    const name = renameValue.trim()
    const prev = projects.find((p) => p.id === id)
    if (!name || !prev || name === prev.name) return
    try {
      await renameProject(id, name)
      setProjects((list) =>
        list.map((p) => (p.id === id ? { ...p, name } : p)),
      )
    } catch {
      toast.error("Failed to rename project")
    }
  }, [renamingId, renameValue, projects])

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
        className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        onClick={() => {
          if (!isOpen) refresh()
          setIsOpen((v) => !v)
        }}
      >
        <Folder className="size-3 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-left">
          {currentProject?.name ?? "Loading..."}
        </span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
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
              setRenamingId(null)
            }}
          />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : projects.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                No projects yet
              </div>
            ) : (
              <div className="max-h-48 overflow-auto py-1">
                {projects.map((p) => {
                  const isCurrent = p.id === projectId
                  const isConfirming = confirmDeleteId === p.id
                  const isRenamingThis = renamingId === p.id
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "group flex h-8 w-full items-center gap-2 px-3 text-xs transition-colors",
                        !isConfirming && "hover:bg-accent",
                        isCurrent && !isConfirming && "bg-accent",
                      )}
                    >
                      {isRenamingThis ? (
                        <input
                          // autoFocus is intentional: the input appears in
                          // direct response to the pencil click.
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
                          value={renameValue}
                          aria-label={`Rename ${p.name}`}
                          className="w-full min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          onChange={(e) => setRenameValue(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur()
                            } else if (e.key === "Escape") {
                              renameCancelledRef.current = true
                              e.currentTarget.blur()
                            }
                          }}
                          onBlur={() => {
                            void handleRenameCommit()
                          }}
                        />
                      ) : isConfirming ? (
                        <>
                          <span className="flex-1 truncate text-[11px] text-destructive">
                            Delete &ldquo;{p.name}&rdquo;?
                          </span>
                          <button
                            type="button"
                            className="rounded bg-destructive px-2 py-0.5 text-[11px] font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            onClick={() => handleDelete(p.id)}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex size-3 shrink-0 items-center justify-center">
                            {isCurrent && (
                              <Check className="size-3 text-foreground" />
                            )}
                          </span>
                          <button
                            type="button"
                            className="flex-1 truncate text-left focus-visible:outline-none"
                            onClick={() => handleSelect(p.id)}
                          >
                            {p.name}
                          </button>
                          <button
                            type="button"
                            aria-label={`Rename ${p.name}`}
                            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-colors hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              renameCancelledRef.current = false
                              setConfirmDeleteId(null)
                              setRenameValue(p.name)
                              setRenamingId(p.id)
                            }}
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${p.name}`}
                            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
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
                  )
                })}
              </div>
            )}
            <div className="border-t border-border">
              <button
                type="button"
                className="group flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
                onClick={handleCreate}
                disabled={isCreating}
              >
                {isCreating ? (
                  <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <Plus className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
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

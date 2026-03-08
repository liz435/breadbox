import { useState, useRef, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useProject } from "@/project/project-context"
import { renameProject } from "@/project/api-client"
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Box,
  Image,
  FileCode,
  Layers,
  Clapperboard,
} from "lucide-react"
import { cn } from "@/lib/utils"

type TreeNodeProps = {
  label: string
  icon: React.ReactNode
  depth: number
  count?: number
  defaultOpen?: boolean
  children?: React.ReactNode
}

function TreeNode({
  label,
  icon,
  depth,
  count,
  defaultOpen = false,
  children,
}: TreeNodeProps) {
  const [open, setOpen] = useState(defaultOpen)
  const hasChildren = children !== undefined

  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 w-full px-2 py-1 text-xs hover:bg-accent transition-colors text-left",
          !hasChildren && "cursor-default",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => hasChildren && setOpen((v) => !v)}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <span className="shrink-0">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {count !== undefined && (
          <span className="text-muted-foreground tabular-nums">{count}</span>
        )}
      </button>
      {hasChildren && open && <div>{children}</div>}
    </div>
  )
}

function LeafItem({
  label,
  icon,
  depth,
  detail,
}: {
  label: string
  icon: React.ReactNode
  depth: number
  detail?: string
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <span className="size-3 shrink-0" />
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {detail && <span className="text-muted-foreground/70">{detail}</span>}
    </div>
  )
}

const ASSET_ICONS: Record<string, React.ReactNode> = {
  sprite: <Image className="size-3 text-green-400" />,
  spritesheet: <Layers className="size-3 text-blue-400" />,
  script: <FileCode className="size-3 text-yellow-400" />,
  audio: <Clapperboard className="size-3 text-purple-400" />,
}

function EditableProjectName({ name, projectId }: { name: string; projectId: string }) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  const { switchProject } = useProject()

  const commit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || trimmed === name) {
      setValue(name)
      setIsEditing(false)
      return
    }
    setIsEditing(false)
    renameProject(projectId, trimmed)
      .then(() => {
        // Reload project to reflect the new name everywhere
        switchProject(projectId)
      })
      .catch(() => {
        setValue(name)
      })
  }, [value, name, projectId, switchProject])

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="text-xs font-semibold text-foreground bg-transparent border-b border-accent outline-none w-full uppercase tracking-wider"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") {
            setValue(name)
            setIsEditing(false)
          }
        }}
        autoFocus
      />
    )
  }

  return (
    <h2
      className="text-xs font-semibold text-foreground uppercase tracking-wider cursor-text hover:text-accent-foreground transition-colors"
      onDoubleClick={() => {
        setValue(name)
        setIsEditing(true)
      }}
      title="Double-click to rename"
    >
      {name}
    </h2>
  )
}

export function ProjectFiles() {
  const { projectFile } = useProject()
  const { project, scenes, entities, assets, graph } = projectFile

  const sceneList = Object.values(scenes)
  const assetList = Object.values(assets)
  const entityList = Object.values(entities)
  const nodeCount = graph ? Object.keys(graph.nodes).length : 0
  const edgeCount = graph ? Object.keys(graph.edges).length : 0

  return (
    <div className="h-full bg-card flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <EditableProjectName name={project.name} projectId={project.id} />
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {/* Scenes */}
          <TreeNode
            label="Scenes"
            icon={
              <Folder className="size-3 text-blue-400" />
            }
            depth={0}
            count={sceneList.length}
            defaultOpen
          >
            {sceneList.map((scene) => {
              const sceneEntities = entityList.filter(
                (e) => e.sceneId === scene.id,
              )
              return (
                <TreeNode
                  key={scene.id}
                  label={scene.name}
                  icon={
                    <FolderOpen className="size-3 text-blue-300" />
                  }
                  depth={1}
                  count={sceneEntities.length}
                  defaultOpen
                >
                  {sceneEntities.length === 0 ? (
                    <div
                      className="text-xs text-muted-foreground/50 py-1"
                      style={{ paddingLeft: `${2 * 12 + 8 + 18}px` }}
                    >
                      No entities
                    </div>
                  ) : (
                    sceneEntities
                      .filter((e) => e.parentId === null)
                      .map((entity) => (
                        <EntityNode
                          key={entity.id}
                          entityId={entity.id}
                          depth={2}
                        />
                      ))
                  )}
                </TreeNode>
              )
            })}
          </TreeNode>

          {/* Assets */}
          <TreeNode
            label="Assets"
            icon={<Folder className="size-3 text-green-400" />}
            depth={0}
            count={assetList.length}
            defaultOpen={assetList.length > 0}
          >
            {assetList.length === 0 ? (
              <div
                className="text-xs text-muted-foreground/50 py-1"
                style={{ paddingLeft: `${1 * 12 + 8 + 18}px` }}
              >
                No assets
              </div>
            ) : (
              assetList.map((asset) => (
                <LeafItem
                  key={asset.id}
                  label={
                    (asset.meta?.name as string) ??
                    asset.uri.split("/").pop() ??
                    asset.id
                  }
                  icon={
                    ASSET_ICONS[asset.type] ?? (
                      <Box className="size-3 text-muted-foreground" />
                    )
                  }
                  depth={1}
                  detail={asset.type}
                />
              ))
            )}
          </TreeNode>

          {/* Graph */}
          <TreeNode
            label="Graph"
            icon={<Folder className="size-3 text-amber-400" />}
            depth={0}
            defaultOpen={nodeCount > 0}
          >
            <LeafItem
              label="Nodes"
              icon={<Box className="size-3 text-amber-300" />}
              depth={1}
              detail={String(nodeCount)}
            />
            <LeafItem
              label="Edges"
              icon={<Box className="size-3 text-amber-300" />}
              depth={1}
              detail={String(edgeCount)}
            />
          </TreeNode>
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Entity tree node (recursive) ──────────────────────────────────────────────

function EntityNode({ entityId, depth }: { entityId: string; depth: number }) {
  const { projectFile } = useProject()
  const entity = projectFile.entities[entityId]
  if (!entity) return null

  const hasChildren = entity.childIds.length > 0

  if (!hasChildren) {
    return (
      <LeafItem
        label={entity.name}
        icon={<Box className="size-3 text-cyan-400" />}
        depth={depth}
      />
    )
  }

  return (
    <TreeNode
      label={entity.name}
      icon={<Box className="size-3 text-cyan-400" />}
      depth={depth}
      count={entity.childIds.length}
    >
      {entity.childIds.map((childId) => (
        <EntityNode key={childId} entityId={childId} depth={depth + 1} />
      ))}
    </TreeNode>
  )
}

import { useState, useRef, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useProject } from "@/project/project-context"
import { useGraph } from "@/store/graph-context"
import { useScene } from "@/store/scene-context"
import { renameProject, renameScene, renameProjectAsset } from "@/project/api-client"
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Box,
  Image,
  FileCode,
  Layers,
  Film,
  Music,
  FileText,
  Type,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Inline editable name ────────────────────────────────────────────────────

function useInlineEdit(
  currentName: string,
  onCommit: (name: string) => void,
) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(currentName)

  const startEditing = useCallback(() => {
    setValue(currentName)
    setIsEditing(true)
  }, [currentName])

  const commit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || trimmed === currentName) {
      setValue(currentName)
      setIsEditing(false)
      return
    }
    setIsEditing(false)
    onCommit(trimmed)
  }, [value, currentName, onCommit])

  const cancel = useCallback(() => {
    setValue(currentName)
    setIsEditing(false)
  }, [currentName])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") commit()
      if (e.key === "Escape") cancel()
    },
    [commit, cancel],
  )

  return { isEditing, value, setValue, startEditing, commit, cancel, handleKeyDown }
}

// ── Tree components ─────────────────────────────────────────────────────────

type TreeNodeProps = {
  label: string
  icon: React.ReactNode
  depth: number
  count?: number
  defaultOpen?: boolean
  onRename?: (name: string) => void
  children?: React.ReactNode
}

function TreeNode({
  label,
  icon,
  depth,
  count,
  defaultOpen = false,
  onRename,
  children,
}: TreeNodeProps) {
  const [open, setOpen] = useState(defaultOpen)
  const hasChildren = children !== undefined
  const edit = useInlineEdit(label, onRename ?? (() => {}))

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
        onDoubleClick={(e) => {
          if (onRename) {
            e.stopPropagation()
            edit.startEditing()
          }
        }}
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
        {edit.isEditing ? (
          <input
            className="flex-1 min-w-0 bg-transparent text-xs text-foreground border-b border-accent outline-none"
            value={edit.value}
            onChange={(e) => edit.setValue(e.target.value)}
            onBlur={edit.commit}
            onKeyDown={edit.handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span className="flex-1 truncate">{label}</span>
        )}
        {count !== undefined && !edit.isEditing && (
          <span className="text-muted-foreground tabular-nums">{count}</span>
        )}
      </button>
      {hasChildren && open && <div>{children}</div>}
    </div>
  )
}

type LeafItemProps = {
  label: string
  icon: React.ReactNode
  depth: number
  detail?: string
  selected?: boolean
  onClick?: () => void
  onRename?: (name: string) => void
}

function LeafItem({ label, icon, depth, detail, selected, onClick, onRename }: LeafItemProps) {
  const edit = useInlineEdit(label, onRename ?? (() => {}))

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground transition-colors",
        onClick && "cursor-pointer hover:bg-accent",
        selected && "bg-accent text-foreground",
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={onClick}
      onDoubleClick={() => {
        if (onRename) edit.startEditing()
      }}
    >
      <span className="size-3 shrink-0" />
      <span className="shrink-0">{icon}</span>
      {edit.isEditing ? (
        <input
          className="flex-1 min-w-0 bg-transparent text-xs text-foreground border-b border-accent outline-none"
          value={edit.value}
          onChange={(e) => edit.setValue(e.target.value)}
          onBlur={edit.commit}
          onKeyDown={edit.handleKeyDown}
          autoFocus
        />
      ) : (
        <>
          <span className="flex-1 truncate">{label}</span>
          {detail && <span className="text-muted-foreground/70">{detail}</span>}
        </>
      )}
    </div>
  )
}

// ── Asset icons ─────────────────────────────────────────────────────────────

const ASSET_ICONS: Record<string, React.ReactNode> = {
  sprite: <Image className="size-3 text-green-400" />,
  spritesheet: <Layers className="size-3 text-blue-400" />,
  script: <FileCode className="size-3 text-yellow-400" />,
  shader: <FileCode className="size-3 text-orange-400" />,
  audio: <Music className="size-3 text-purple-400" />,
  video: <Film className="size-3 text-pink-400" />,
  text: <FileText className="size-3 text-neutral-400" />,
  font: <Type className="size-3 text-teal-400" />,
  material: <Box className="size-3 text-indigo-400" />,
}

function formatSize(bytes: unknown): string {
  if (typeof bytes !== "number") return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Maps asset type to the graph node type for re-adding */
const ASSET_TO_NODE_TYPE: Record<string, string> = {
  sprite: "sprite",
  audio: "audio",
  video: "video",
  shader: "shader",
  script: "code",
  text: "text",
}

type AssetItemProps = {
  asset: { id: string; type: string; uri: string; meta: Record<string, unknown> }
  depth: number
  onRename?: (assetId: string, name: string) => void
}

function AssetItem({ asset, depth, onRename }: AssetItemProps) {
  const name = (asset.meta?.name as string) ?? asset.uri.split("/").pop() ?? asset.id
  const size = formatSize(asset.meta?.size)
  const edit = useInlineEdit(name, (newName) => onRename?.(asset.id, newName))

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (edit.isEditing) {
        e.preventDefault()
        return
      }
      const nodeType = ASSET_TO_NODE_TYPE[asset.type] ?? "text"
      e.dataTransfer.setData(
        "application/x-dreamer-asset",
        JSON.stringify({
          assetId: asset.id,
          assetType: asset.type,
          nodeType,
          uri: asset.uri,
          name: asset.meta?.originalName ?? name,
          mimeType: asset.meta?.mimeType ?? "",
          size: asset.meta?.size ?? 0,
        }),
      )
      e.dataTransfer.effectAllowed = "copy"
    },
    [asset, name, edit.isEditing],
  )

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground cursor-grab active:cursor-grabbing hover:bg-accent transition-colors"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      draggable={!edit.isEditing}
      onDragStart={handleDragStart}
      onDoubleClick={() => {
        if (onRename) edit.startEditing()
      }}
    >
      <span className="size-3 shrink-0" />
      <span className="shrink-0">
        {ASSET_ICONS[asset.type] ?? <Box className="size-3 text-muted-foreground" />}
      </span>
      {edit.isEditing ? (
        <input
          className="flex-1 min-w-0 bg-transparent text-xs text-foreground border-b border-accent outline-none"
          value={edit.value}
          onChange={(e) => edit.setValue(e.target.value)}
          onBlur={edit.commit}
          onKeyDown={edit.handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <>
          <span className="flex-1 truncate">{name}</span>
          {size && <span className="text-muted-foreground/70">{size}</span>}
        </>
      )}
    </div>
  )
}

// ── Editable project name (header) ──────────────────────────────────────────

function EditableProjectName({ name, projectId }: { name: string; projectId: string }) {
  const { switchProject } = useProject()

  const handleRename = useCallback(
    (newName: string) => {
      renameProject(projectId, newName)
        .then(() => switchProject(projectId))
        .catch(() => {})
    },
    [projectId, switchProject],
  )

  const edit = useInlineEdit(name, handleRename)

  if (edit.isEditing) {
    return (
      <input
        className="text-xs font-semibold text-foreground bg-transparent border-b border-accent outline-none w-full uppercase tracking-wider"
        value={edit.value}
        onChange={(e) => edit.setValue(e.target.value)}
        onBlur={edit.commit}
        onKeyDown={edit.handleKeyDown}
        autoFocus
      />
    )
  }

  return (
    <h2
      className="text-xs font-semibold text-foreground uppercase tracking-wider cursor-text hover:text-accent-foreground transition-colors"
      onDoubleClick={edit.startEditing}
      title="Double-click to rename"
    >
      {name}
    </h2>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function ProjectFiles() {
  const { projectFile, projectId, switchProject } = useProject()
  const { state: graphState, send: graphSend } = useGraph()
  const { state: sceneState, send: sceneSend } = useScene()
  const { project, scenes, assets } = projectFile

  const sceneList = Object.values(scenes)
  const assetList = Object.values(assets)
  const spriteCount = sceneState.sprites.length + (sceneState.tilemap ? 1 : 0)
  const nodeCount = Object.keys(graphState.nodes).length
  const edgeCount = Object.keys(graphState.edges).length

  const handleRenameScene = useCallback(
    (sceneId: string, name: string) => {
      renameScene(projectId, sceneId, name)
        .then(() => switchProject(projectId))
        .catch(() => {})
    },
    [projectId, switchProject],
  )

  const handleRenameSprite = useCallback(
    (spriteId: string, name: string) => {
      sceneSend({ type: "UPDATE", id: spriteId, changes: { name } })
    },
    [sceneSend],
  )

  const handleRenameNode = useCallback(
    (nodeId: string, name: string) => {
      graphSend({ type: "RENAME_NODE", nodeId, name })
    },
    [graphSend],
  )

  const handleRenameAsset = useCallback(
    (assetId: string, name: string) => {
      renameProjectAsset(projectId, assetId, name)
        .then(() => switchProject(projectId))
        .catch(() => {})
    },
    [projectId, switchProject],
  )

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
            icon={<Folder className="size-3 text-blue-400" />}
            depth={0}
            count={sceneList.length}
            defaultOpen
          >
            {sceneList.map((scene) => (
              <TreeNode
                key={scene.id}
                label={scene.name}
                icon={<FolderOpen className="size-3 text-blue-300" />}
                depth={1}
                count={spriteCount}
                defaultOpen
                onRename={(name) => handleRenameScene(scene.id, name)}
              >
                {spriteCount === 0 ? (
                  <div
                    className="text-xs text-muted-foreground/50 py-1"
                    style={{ paddingLeft: `${2 * 12 + 8 + 18}px` }}
                  >
                    No entities
                  </div>
                ) : (
                  <>
                    {sceneState.tilemap && (
                      <LeafItem
                        label="Tilemap"
                        icon={<Layers className="size-3 text-emerald-400" />}
                        depth={2}
                        detail={`${sceneState.tilemap.width}\u00d7${sceneState.tilemap.height}`}
                      />
                    )}
                    {sceneState.sprites.map((sprite) => (
                      <LeafItem
                        key={sprite.id}
                        label={sprite.name}
                        icon={<Box className="size-3 text-cyan-400" />}
                        depth={2}
                        onRename={(name) => handleRenameSprite(sprite.id, name)}
                      />
                    ))}
                  </>
                )}
              </TreeNode>
            ))}
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
                No assets — drop files on the graph
              </div>
            ) : (
              assetList.map((asset) => (
                <AssetItem key={asset.id} asset={asset} depth={1} onRename={handleRenameAsset} />
              ))
            )}
          </TreeNode>

          {/* Graph */}
          <TreeNode
            label="Graph"
            icon={<Folder className="size-3 text-amber-400" />}
            depth={0}
            count={nodeCount}
            defaultOpen={nodeCount > 0}
          >
            {nodeCount === 0 ? (
              <div
                className="text-xs text-muted-foreground/50 py-1"
                style={{ paddingLeft: `${1 * 12 + 8 + 18}px` }}
              >
                No nodes
              </div>
            ) : (
              <>
                {Object.values(graphState.nodes).map((node) => (
                  <LeafItem
                    key={node.id}
                    label={node.name}
                    icon={<Box className="size-3 text-amber-300" />}
                    depth={1}
                    detail={node.type}
                    selected={graphState.selectedNodeIds.has(node.id)}
                    onClick={() => graphSend({ type: "SELECT_NODES", nodeIds: [node.id] })}
                    onRename={(name) => handleRenameNode(node.id, name)}
                  />
                ))}
                <LeafItem
                  label="Edges"
                  icon={<Box className="size-3 text-amber-200/50" />}
                  depth={1}
                  detail={String(edgeCount)}
                />
              </>
            )}
          </TreeNode>
        </div>
      </ScrollArea>
    </div>
  )
}

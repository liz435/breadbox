import { FolderOpen, Terminal, Code, SlidersHorizontal, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useDockviewApi } from "@/store/dockview-context"
import { useBoard } from "@/store/board-context"
import { useRouter } from "@/router"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { cn } from "@/utils/classnames"
import { onSaveFlash } from "@/project/save-ref"

// ── Serial output badge ──────────────────────────────────────────────────

/** Track whether there are unread serial messages since the panel was last opened. */
let hasUnread = false
let unreadListeners = new Set<() => void>()

function notifyUnread() {
  for (const fn of unreadListeners) fn()
}

export function markSerialUnread() {
  if (!hasUnread) {
    hasUnread = true
    notifyUnread()
  }
}

export function clearSerialUnread() {
  if (hasUnread) {
    hasUnread = false
    notifyUnread()
  }
}

function useSerialUnread(): boolean {
  return useSyncExternalStore(
    (cb) => {
      unreadListeners.add(cb)
      return () => { unreadListeners.delete(cb) }
    },
    () => hasUnread,
  )
}

// ── Layout snapshot for size restoration ────────────────────────────────

/**
 * Before removing panels we snapshot the full dockview layout via toJSON().
 * When restoring, we reload the snapshot — this preserves panel sizes exactly.
 */
const savedLayouts = new Map<string, unknown>()

// ── Toolbar ──────────────────────────────────────────────────────────────

// Shared juicy styling for the icon tools: rounded, springy press, and a
// bold amber fill when the tool's panel is open (mirrors the Toggle's
// data-[pressed] look so the whole bar reads as one system).
const TOOL_BTN = "size-9 rounded-xl transition-all duration-150 active:scale-90"
const TOOL_ACTIVE =
  "bg-primary text-primary-foreground shadow-sm shadow-primary/40 hover:bg-primary/90 hover:text-primary-foreground"

function togglePanel(api: ReturnType<typeof useDockviewApi>, panelId: string, component: string, title: string, refPanel?: string) {
  if (!api) return
  const existing = api.getPanel(panelId)
  if (existing) {
    if (existing.api.isVisible) {
      savedLayouts.set(panelId, api.toJSON())
      api.removePanel(existing)
    } else {
      existing.api.setActive()
    }
  } else {
    const snapshot = savedLayouts.get(panelId)
    if (snapshot) {
      try {
        api.fromJSON(snapshot as ReturnType<typeof api.toJSON>)
        api.getPanel(panelId)?.api.setActive()
        return
      } catch { /* fall through to manual add */ }
    }
    const ref = refPanel ? api.getPanel(refPanel) : undefined
    api.addPanel({
      id: panelId,
      component,
      title,
      position: ref
        ? { referencePanel: ref, direction: "within" }
        : { direction: "right" },
    })
  }
}

type PanelDef = { id: string; component: string; title: string }

/** Toggle a group of tabbed panels together. Removes all if any are visible, restores all if none are. */
function togglePanelGroup(api: ReturnType<typeof useDockviewApi>, panels: PanelDef[]) {
  if (!api) return
  const groupKey = panels.map(p => p.id).join("+")

  const existing = panels.map(p => api.getPanel(p.id)).filter(Boolean)
  const anyVisible = existing.some(p => p!.api.isVisible)

  if (anyVisible) {
    // Save full layout before removing
    savedLayouts.set(groupKey, api.toJSON())
    for (const p of existing) {
      api.removePanel(p!)
    }
  } else {
    // Try to restore from snapshot (preserves sizes)
    const snapshot = savedLayouts.get(groupKey)
    if (snapshot) {
      try {
        api.fromJSON(snapshot as ReturnType<typeof api.toJSON>)
        api.getPanel(panels[0].id)?.api.setActive()
        return
      } catch { /* fall through to manual add */ }
    }
    // Manual add fallback
    let anchor: string | undefined
    for (const p of panels) {
      const alreadyExists = api.getPanel(p.id)
      if (alreadyExists) {
        alreadyExists.api.setActive()
        anchor = p.id
        continue
      }
      const ref = anchor ? api.getPanel(anchor) : undefined
      api.addPanel({
        id: p.id,
        component: p.component,
        title: p.title,
        position: ref
          ? { referencePanel: ref, direction: "within" }
          : { direction: "right" },
      })
      anchor = p.id
    }
    api.getPanel(panels[0].id)?.api.setActive()
  }
}

/** Check if any panel in the list exists in dockview */
function isPanelOpen(api: ReturnType<typeof useDockviewApi>, ...ids: string[]): boolean {
  if (!api) return false
  return ids.some(id => {
    const p = api.getPanel(id)
    return p != null
  })
}

export function EditToolbar() {
  const dockviewApi = useDockviewApi()
  const { state } = useBoard()
  const { navigate } = useRouter()
  const serialUnread = useSerialUnread()
  const prevSerialLenRef = useRef(state.serialOutput.length)
  const [, setTick] = useState(0)
  const [saveFlash, setSaveFlash] = useState(false)

  // Flash the project button green on save
  useEffect(() => {
    return onSaveFlash(() => {
      setSaveFlash(true)
      setTimeout(() => setSaveFlash(false), 600)
    })
  }, [])
  const rerender = useCallback(() => setTick(t => t + 1), [])

  // Subscribe to dockview layout changes to track panel open/close state
  useEffect(() => {
    if (!dockviewApi) return
    const disposable = dockviewApi.onDidLayoutChange(() => rerender())
    return () => disposable.dispose()
  }, [dockviewApi, rerender])

  // Mark unread whenever serial output grows (checked lazily during render)
  if (state.serialOutput.length > prevSerialLenRef.current) {
    // Only mark unread if serial monitor is not visible
    const serialPanel = dockviewApi?.getPanel("serialMonitor")
    if (!serialPanel || !serialPanel.api.isVisible) {
      markSerialUnread()
    }
  }
  prevSerialLenRef.current = state.serialOutput.length

  const projectOpen = isPanelOpen(dockviewApi, "projectFiles")
  const serialOpen = isPanelOpen(dockviewApi, "serialMonitor")
  const sketchOpen = isPanelOpen(dockviewApi, "sketchEditor", "graph", "schematic", "libraryManager")
  const inspectorOpen = isPanelOpen(dockviewApi, "inspector", "diagram", "pinInspector")
  const electricalOpen = isPanelOpen(dockviewApi, "electricalReport")

  const handleProject = useCallback(() => {
    togglePanel(dockviewApi, "projectFiles", "projectFiles", "Project")
  }, [dockviewApi])

  const handleSerialMonitor = useCallback(() => {
    clearSerialUnread()
    togglePanel(dockviewApi, "serialMonitor", "serialMonitor", "Serial Monitor", "breadboard")
  }, [dockviewApi])

  const handleSketch = useCallback(() => {
    togglePanelGroup(dockviewApi, [
      { id: "sketchEditor", component: "sketchEditor", title: "Sketch" },
      { id: "graph", component: "graph", title: "Graph" },
      { id: "schematic", component: "schematic", title: "Schematic" },
      { id: "libraryManager", component: "libraryManager", title: "Libraries" },
    ])
  }, [dockviewApi])

  const handleInspector = useCallback(() => {
    togglePanelGroup(dockviewApi, [
      { id: "inspector", component: "inspector", title: "Inspector" },
      { id: "diagram", component: "diagram", title: "Diagram" },
      { id: "pinInspector", component: "pinInspector", title: "Pin Inspector" },
      { id: "electricalReport", component: "electricalReport", title: "Electrical" },
    ])
  }, [dockviewApi])

  return (
    <div className="flex items-center gap-1">
      {/* Project */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={handleProject}
              className={cn(
                TOOL_BTN,
                projectOpen && TOOL_ACTIVE,
                saveFlash && "bg-emerald-500/30 text-emerald-400",
              )}
            />
          }
        >
          <FolderOpen className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Project</TooltipContent>
      </Tooltip>

      {/* Serial Monitor */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSerialMonitor}
              className={cn(TOOL_BTN, "relative", serialOpen && TOOL_ACTIVE)}
            />
          }
        >
          <Terminal className="size-4" />
          {serialUnread && (
            <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-yellow-400" />
          )}
        </TooltipTrigger>
        <TooltipContent>Serial Monitor</TooltipContent>
      </Tooltip>

      {/* Sketch */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSketch}
              className={cn(TOOL_BTN, sketchOpen && TOOL_ACTIVE)}
            />
          }
        >
          <Code className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Sketch</TooltipContent>
      </Tooltip>

      {/* Inspector */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={handleInspector}
              className={cn(TOOL_BTN, (inspectorOpen || electricalOpen) && TOOL_ACTIVE)}
            />
          }
        >
          <SlidersHorizontal className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Inspector</TooltipContent>
      </Tooltip>

      {/* Documentation */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/documentation")}
              className={TOOL_BTN}
            />
          }
        >
          <BookOpen className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Documentation</TooltipContent>
      </Tooltip>
    </div>
  )
}

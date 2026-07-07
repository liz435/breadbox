import { useCallback, useEffect, useState } from "react"
import { BookOpen, Bug, Box, Square, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useDockviewApi } from "@/store/dockview-context"
import { useRouter } from "@/router"
import { cn } from "@/utils/classnames"
import { onSaveFlash } from "@/project/save-ref"
import {
  WORKSPACE_MODES,
  applyWorkspaceMode,
  modeShowsSerial,
  useWorkspaceMode,
  type WorkspaceMode,
} from "@/store/workspace-modes"
import { clearSerialUnread, useSerialUnread } from "./serial-unread"

// ── Toolbar ──────────────────────────────────────────────────────────────

// Shared juicy styling for the icon tools: rounded, springy press, and a bold
// amber fill when active (mirrors the Toggle's data-[pressed] look so the whole
// bar reads as one system).
const TOOL_BTN = "size-9 rounded-xl transition-all duration-150 active:scale-90"
const TOOL_ACTIVE =
  "bg-primary text-primary-foreground shadow-sm shadow-primary/40 hover:bg-primary/90 hover:text-primary-foreground"

const MODE_ICONS: Record<WorkspaceMode, LucideIcon> = {
  "2d": Square,
  "3d": Box,
  debug: Bug,
}

export function EditToolbar() {
  const dockviewApi = useDockviewApi()
  const { navigate } = useRouter()
  const mode = useWorkspaceMode()
  const serialUnread = useSerialUnread()
  const [saveFlash, setSaveFlash] = useState(false)

  // Flash the 2D button green on save (2D owns the project/components panel,
  // so it's the natural anchor for the save cue).
  useEffect(() => {
    return onSaveFlash(() => {
      setSaveFlash(true)
      setTimeout(() => setSaveFlash(false), 600)
    })
  }, [])

  const handleMode = useCallback(
    (next: WorkspaceMode) => {
      applyWorkspaceMode(dockviewApi, next)
      // Entering a mode that shows the Serial Monitor means the output is now
      // visible — drop the unread dot.
      if (modeShowsSerial(next)) clearSerialUnread()
    },
    [dockviewApi],
  )

  return (
    <div className="flex items-center gap-1">
      {/* Workspace modes — each opens its tab set and closes the rest. */}
      <div
        data-onboarding="modes"
        className="flex items-center gap-0.5 rounded-2xl bg-secondary/40 p-0.5"
      >
        {WORKSPACE_MODES.map((m) => {
          const Icon = MODE_ICONS[m.id]
          const active = mode === m.id
          // Serial lives in Debug; surface new output on that button.
          const showUnread = m.id === "debug" && serialUnread && !active
          return (
            <Tooltip key={m.id}>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMode(m.id)}
                    aria-pressed={active}
                    className={cn(
                      TOOL_BTN,
                      "relative rounded-xl",
                      active && TOOL_ACTIVE,
                      m.id === "2d" && saveFlash && "bg-emerald-500/30 text-emerald-500",
                    )}
                  />
                }
              >
                <Icon className="size-4" />
                {showUnread && (
                  <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-yellow-400" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-medium">{m.label}</span>
                <span className="text-muted-foreground"> — {m.hint}</span>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

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

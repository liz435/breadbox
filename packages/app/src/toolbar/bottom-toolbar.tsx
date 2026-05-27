import { useCallback, useState } from "react"
import { Pencil, Sparkles } from "lucide-react"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PromptBox } from "@/chat/prompt-box"
import { useBoard } from "@/store/board-context"
import { useSimulation } from "@/simulator/simulation-loop"
import { simulationRef } from "@/simulator/simulation-ref"
import type { LibraryState } from "@dreamer/schemas"
import { EditToolbar, markSerialUnread } from "./edit-toolbar"
import { PlayControls } from "./play-controls"
import { StatusDisplay } from "./status-display"
import { BoardStatus } from "./board-status"
import { AiToolbarHistory } from "./ai-toolbar"
import { useChatMessages } from "./use-chat-messages"
import { AuthStatusBadge } from "@/auth/auth-status-badge"
import { CreditChip } from "@/billing/credit-chip"

// Pin the agent to the propose_fix-reliability snapshot (1.6.0). v1.5.0
// kept propose_circuit-first for build; v1.6.0 closes part of the
// propose_fix gap (22% per-call success in eval) by inlining wire IDs +
// raising the board-summary limits so the agent no longer needs to call
// list_components/list_wires first, returning "Did you mean X?" on
// unknown IDs, and exposing verify_circuit in edit mode for post-fix
// sketch/pin consistency checks.
// See `packages/api/src/agents/version.ts` for the full changelog.
const AGENT_SNAPSHOT_VERSION = "1.6.0"

type ToolbarMode = "edit" | "ai"

function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: ToolbarMode
  onModeChange: (mode: ToolbarMode) => void
}) {
  return (
    <ToggleGroup
      value={[mode]}
      onValueChange={(newValue: string[]) => {
        if (newValue.length > 0) {
          onModeChange(newValue[0] as ToolbarMode)
        }
      }}
      className="border-none gap-0"
    >
      <Toggle value="edit" size="sm" className="rounded-r-none">
        <Pencil className="size-3.5" />
      </Toggle>
      <Toggle value="ai" size="sm" className="rounded-l-none">
        <Sparkles className="size-3.5" />
      </Toggle>
    </ToggleGroup>
  )
}

export function BottomToolbar() {
  const [mode, setMode] = useState<ToolbarMode>("edit")
  const chat = useChatMessages({ snapshotVersion: AGENT_SNAPSHOT_VERSION })
  const { send: boardSend } = useBoard()

  // Lift the simulation here so PlayControls and StatusDisplay share one
  // instance (and one xstate machine). The simulationRef is consumed by
  // sketch-editor, command palette, serial monitor, etc.
  const onSerialPrint = useCallback(
    (text: string) => {
      boardSend({ type: "APPEND_SERIAL", text })
      markSerialUnread()
    },
    [boardSend],
  )
  const onLibraryStateChange = useCallback(
    (changes: Partial<LibraryState>) => {
      boardSend({ type: "SET_LIBRARY_STATE", changes })
    },
    [boardSend],
  )
  const onBuildLog = useCallback(
    (tag: "compiler" | "upload", line: string, ts: number) => {
      boardSend({ type: "APPEND_BUILD_LOG", tag, line, ts })
    },
    [boardSend],
  )

  const sim = useSimulation({ onSerialPrint, onLibraryStateChange, onBuildLog })
  simulationRef.current = sim

  // Floating variant: no full-width strip. The toolbar now sits as a
  // self-contained card absolutely positioned by the parent (see
  // app.tsx). We set pointer-events-none on the outer wrapper so the
  // canvas remains draggable through the empty space around the card,
  // and re-enable pointer-events on the interactive children.
  return (
    <div className="pointer-events-none relative">
      {/* AI history — floats upward over the dockview content when
          expanded. Absolute positioning relative to this wrapper. */}
      {mode === "ai" && (
        <div className="absolute inset-x-0 bottom-full flex justify-center px-4 pb-2">
          <div className="pointer-events-auto w-[640px]">
            <AiToolbarHistory chat={chat} />
          </div>
        </div>
      )}

      {/* Toolbar card — the 640px pill is the only visible chrome. Each
          mode already carries its own bg-card + border + shadow, so
          removing the outer strip doesn't change the pill's look. The
          credit/auth chips are absolutely positioned to the right so
          they don't shift the main pill off viewport-center (the AI
          history above is centered on the viewport, and the pill must
          line up with it). */}
      <div className="relative flex items-center justify-center px-4 pb-3">
        <TooltipProvider delay={400}>
          {mode === "edit" ? (
            <div className="pointer-events-auto flex h-10 w-fit items-center gap-2 rounded-lg border border-border bg-card px-2 shadow-sm">
              <ModeToggle mode={mode} onModeChange={setMode} />
              <Separator orientation="vertical" className="h-6" />
              <EditToolbar />
              <Separator orientation="vertical" className="h-6" />
              <PlayControls sim={sim} />
              {/* Status + Board share one bordered shell so the pair reads
                  as a single status surface instead of a pill next to a
                  loose icon. Border + background live here; StatusDisplay
                  + BoardStatus shed their own container chrome. */}
              <div className="flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background/40 pl-2.5 pr-1">
                <StatusDisplay sim={sim} />
                <BoardStatus />
              </div>
            </div>
          ) : (
            <div className="pointer-events-auto w-[640px]">
              <PromptBox
                value={chat.inputValue}
                onChange={chat.setInputValue}
                onSubmit={chat.handleSubmit}
                onStop={chat.stop}
                isStreaming={chat.status === "streaming" || chat.status === "submitted"}
                placeholder="Ask the agent, or describe what to build…"
                leading={<ModeToggle mode={mode} onModeChange={setMode} />}
              />
            </div>
          )}
        </TooltipProvider>
        <div className="pointer-events-auto absolute right-4 bottom-3 flex items-center gap-2">
          <CreditChip />
          <AuthStatusBadge />
        </div>
      </div>
    </div>
  )
}

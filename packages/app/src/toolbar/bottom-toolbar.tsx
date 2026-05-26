import { useCallback, useState } from "react"
import { Pencil, Sparkles } from "lucide-react"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
import {
  AGENT_SNAPSHOT_DEFAULT,
  AGENT_SNAPSHOT_FALLBACK,
  useAgentSnapshot,
  type AgentSnapshotChoice,
} from "./use-agent-snapshot"

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

function AgentSnapshotToggle({
  snapshotVersion,
  onChange,
}: {
  snapshotVersion: AgentSnapshotChoice
  onChange: (next: AgentSnapshotChoice) => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<div className="inline-flex" />}>
        <ToggleGroup
          value={[snapshotVersion]}
          onValueChange={(newValue: string[]) => {
            if (newValue.length > 0) {
              onChange(newValue[0] as AgentSnapshotChoice)
            }
          }}
          className="border-none gap-0"
        >
          <Toggle
            value={AGENT_SNAPSHOT_DEFAULT}
            size="sm"
            className="rounded-r-none px-2 text-[10px] font-semibold tracking-wide"
          >
            DSL
          </Toggle>
          <Toggle
            value={AGENT_SNAPSHOT_FALLBACK}
            size="sm"
            className="rounded-l-none px-2 text-[10px] font-semibold tracking-wide"
          >
            AUTO
          </Toggle>
        </ToggleGroup>
      </TooltipTrigger>
      <TooltipContent>
        Agent build path. <strong>DSL</strong> = apply_design as primary, you control{" "}
        component IDs &amp; positions, no auto-fallback (v1.3.5, default).{" "}
        <strong>AUTO</strong> = propose_circuit auto-layout — describe the circuit, the{" "}
        breadboard is laid out for you (v1.2.5).
      </TooltipContent>
    </Tooltip>
  )
}

export function BottomToolbar() {
  const [mode, setMode] = useState<ToolbarMode>("edit")
  const { snapshotVersion, setSnapshotVersion } = useAgentSnapshot()
  const chat = useChatMessages({ snapshotVersion })
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
          <div className="pointer-events-auto w-full max-w-2xl">
            <AiToolbarHistory chat={chat} />
          </div>
        </div>
      )}

      {/* Toolbar card — the 640px pill is the only visible chrome. Each
          mode already carries its own bg-card + border + shadow, so
          removing the outer strip doesn't change the pill's look. The
          AuthStatusBadge sits as a sibling pill so it stays visible
          across mode swaps. */}
      <div className="flex items-center justify-center gap-2 px-4 pb-3">
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
                leading={
                  <div className="flex items-center gap-1">
                    <ModeToggle mode={mode} onModeChange={setMode} />
                    <Separator orientation="vertical" className="h-5" />
                    <AgentSnapshotToggle
                      snapshotVersion={snapshotVersion}
                      onChange={setSnapshotVersion}
                    />
                  </div>
                }
              />
            </div>
          )}
        </TooltipProvider>
        <AuthStatusBadge />
      </div>
    </div>
  )
}

import { useCallback, useRef, useState } from "react"
import { Pencil, Sparkles } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/utils/classnames"
import { PromptBox } from "@/chat/prompt-box"
import { useBoard } from "@/store/board-context"
import { useSimulation } from "@/simulator/simulation-loop"
import { simulationRef } from "@/simulator/simulation-ref"
import { setActiveSimulationSession } from "@/simulator/simulation-session"
import type { LibraryState } from "@dreamer/schemas"
import { EditToolbar } from "./edit-toolbar"
import { markSerialUnread } from "./serial-unread"
import { getWorkspaceMode, modeShowsSerial } from "@/store/workspace-modes"
import { PlayControls } from "./play-controls"
import { StatusDisplay } from "./status-display"
import { BoardStatus } from "./board-status"
import { AiToolbarHistory } from "./ai-toolbar"
import { useChatMessages } from "./use-chat-messages"
import { AuthStatusBadge } from "@/auth/auth-status-badge"
import { AiHubButton } from "@/ai/ai-hub-button"
import { useCurrentUser } from "@/auth/use-current-user"
import { OPEN_API_KEY_EVENT } from "@/auth/api-key-dialog"

// Pin the agent to the v1.5.0 snapshot. Build mode is propose_circuit-first
// with verify_circuit follow-up (returning from the v1.3.x DSL experiment
// after eval showed apply_design converged on only 84% of runs at +43%
// token cost). Edit mode bundles a propose_fix reliability pass: inlined
// wire IDs + raised board-summary limits so the agent no longer needs a
// list_components/list_wires preflight, "Did you mean X?" on unknown IDs,
// and verify_circuit available in edit mode for post-fix sketch/pin
// consistency checks.
// See `packages/api/src/agents/version.ts` for the full changelog.
// Pin to v2.0.0 (multi-agent architecture: Dispatcher → BuildAgent | FixAgent).
// Rollback: change to "1.5.2" to route everyone through the legacy single-agent
// codepath. The 1.5.2 implementation is untouched in agent.ts under
// streamCoreAgentInternal; only the dispatcher in streamCoreAgent gates which
// path each turn takes.
const AGENT_SNAPSHOT_VERSION = "2.0.0"

type ToolbarMode = "edit" | "ai"

const TOOLBAR_MODES = [
  { value: "edit" as const, Icon: Pencil, rounded: "rounded-r-none" },
  { value: "ai" as const, Icon: Sparkles, rounded: "rounded-l-none" },
]

function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: ToolbarMode
  onModeChange: (mode: ToolbarMode) => void
}) {
  const reduceMotion = useReducedMotion()
  return (
    <ToggleGroup
      value={[mode]}
      onValueChange={(newValue: string[]) => {
        if (newValue.length > 0) {
          onModeChange(newValue[0] as ToolbarMode)
        }
      }}
      className="gap-0 rounded-xl border-none bg-secondary/40"
    >
      {TOOLBAR_MODES.map(({ value, Icon, rounded }) => {
        const active = mode === value
        return (
          <Toggle
            key={value}
            value={value}
            size="sm"
            // Background is driven by the shared sliding pill below, not the
            // Toggle's own data-[pressed] fill — so clear that fill and keep the
            // button transparent. text-primary-foreground still tracks the
            // pressed state so the icon under the pill flips to the amber-on
            // color (eased by transition-colors).
            className={cn("relative size-9 hover:bg-transparent data-[pressed]:bg-transparent", rounded)}
            data-onboarding={value === "ai" ? "ai-chat" : undefined}
          >
            {active && (
              <motion.span
                layoutId="mode-toggle-pill"
                aria-hidden
                className="absolute inset-0 rounded-xl bg-primary"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 520, damping: 36, mass: 0.7 }
                }
              />
            )}
            <Icon className="relative z-10 size-3.5" />
          </Toggle>
        )
      })}
    </ToggleGroup>
  )
}

export function BottomToolbar() {
  const [mode, setMode] = useState<ToolbarMode>("edit")
  const chat = useChatMessages({ snapshotVersion: AGENT_SNAPSHOT_VERSION })
  const { send: boardSend } = useBoard()
  const { isHosted, hasApiKey } = useCurrentUser()

  // Switching into AI mode needs an Anthropic key in CLI/desktop mode.
  // When none is saved yet, pop the key dialog so the user can enter one
  // before prompting the agent. Boot already auto-opens this on first run
  // with no key; this covers re-entry after that boot dialog was dismissed.
  const handleModeChange = useCallback(
    (next: ToolbarMode) => {
      setMode(next)
      if (next === "ai" && !isHosted && !hasApiKey) {
        window.dispatchEvent(new Event(OPEN_API_KEY_EVENT))
      }
    },
    [isHosted, hasApiKey],
  )

  // Board-menu state lives here so the status well can flatten its top corners
  // + hide its top border while the menu is open — that's what makes the menu
  // read as the well growing upward (one continuous border) rather than a
  // detached popover. The well is also the menu's anchor (width match).
  //
  // `boardMenuOpen` is the logical open state; `wellExpanded` is the visual
  // flatten, kept separate so it persists through the close animation: it turns
  // on the instant the menu opens and only turns off once the collapse finishes
  // (onExitComplete), so the continuous border survives the whole exit.
  const [boardMenuOpen, setBoardMenuOpen] = useState(false)
  const [wellExpanded, setWellExpanded] = useState(false)
  const wellRef = useRef<HTMLDivElement>(null)

  const handleBoardMenuOpenChange = useCallback((open: boolean) => {
    setBoardMenuOpen(open)
    if (open) setWellExpanded(true)
  }, [])
  const handleBoardMenuExitComplete = useCallback(() => setWellExpanded(false), [])

  // Lift the simulation here so PlayControls and StatusDisplay share one
  // instance (and one xstate machine). The simulationRef is consumed by
  // sketch-editor, command palette, serial monitor, etc.
  const onSerialPrint = useCallback(
    (text: string) => {
      // Tag as simulator so the SerialMonitor's source filter can
      // distinguish this from real-board WebSerial output.
      boardSend({ type: "APPEND_SERIAL", text, source: "simulator" })
      // Only flag unread when the Serial Monitor isn't on screen (it's part of
      // Simulate/Debug). The dot surfaces on the Simulate mode button.
      if (!modeShowsSerial(getWorkspaceMode())) markSerialUnread()
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
  setActiveSimulationSession(sim.session)

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

      {/* Toolbar card — one persistent 640px pill that holds its width, radius,
          and chrome across both modes, so flipping edit ↔ ai swaps only the
          interior controls instead of reshaping the box. Edit tools pack left
          (empty slack on the right); AI mode fills the same shell with the
          chrome-less prompt row. The auth badge is absolutely positioned to the
          right so it doesn't shift the pill off viewport-center (the AI history
          above is centered on the viewport, and the pill must line up). */}
      <div className="relative flex items-center justify-center px-4 pb-3">
        <TooltipProvider delay={400}>
          <div className="pointer-events-auto flex min-h-13 w-[640px] items-center gap-1.5 rounded-2xl border border-border/70 bg-card/90 px-2.5 shadow-[0_12px_40px_-10px_rgba(60,40,10,0.28)] ring-1 ring-black/[0.03] backdrop-blur-xl">
            {mode === "edit" ? (
              <>
                <ModeToggle mode={mode} onModeChange={handleModeChange} />
                <Separator orientation="vertical" className="h-7 bg-border/60" />
                <EditToolbar />
                <Separator orientation="vertical" className="h-7 bg-border/60" />
                <PlayControls sim={sim} />
                {/* Status + Board share one recessed "well" so the pair reads
                    as a single inset status surface. StatusDisplay shows the
                    board picker when idle (and transient status otherwise);
                    BoardStatus owns the USB port. Border/background live here;
                    both children shed their own container chrome. While the
                    board menu is open the top corners flatten + the top border
                    goes transparent so the menu (anchored here, same width) grows
                    out of the well as one continuous bordered surface. */}
                <div
                  ref={wellRef}
                  className={cn(
                    "relative flex h-8 items-center gap-1 border border-border/50 bg-background/60 pl-2.5 pr-1 shadow-inner transition-[border-radius]",
                    wellExpanded ? "rounded-b-xl rounded-t-none border-t-transparent" : "rounded-xl",
                  )}
                >
                  <StatusDisplay
                    sim={sim}
                    boardMenu={{
                      open: boardMenuOpen,
                      onOpenChange: handleBoardMenuOpenChange,
                      anchor: wellRef,
                      onExitComplete: handleBoardMenuExitComplete,
                    }}
                  />
                  <BoardStatus />
                </div>
              </>
            ) : (
              <PromptBox
                value={chat.inputValue}
                onChange={chat.setInputValue}
                onSubmit={chat.handleSubmit}
                onStop={chat.stop}
                isStreaming={chat.status === "streaming" || chat.status === "submitted"}
                placeholder="Ask the agent, or describe what to build…"
                leading={<ModeToggle mode={mode} onModeChange={handleModeChange} />}
              />
            )}
          </div>
        </TooltipProvider>
        <div className="pointer-events-auto absolute right-4 bottom-3 flex items-center gap-2">
          <AiHubButton />
          <AuthStatusBadge />
        </div>
      </div>
    </div>
  )
}

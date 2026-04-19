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
import { AiToolbarHistory } from "./ai-toolbar"
import { useChatMessages } from "./use-chat-messages"

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
  const chat = useChatMessages()
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

  return (
    <div className="relative shrink-0 border-t border-border bg-background">
      {/* AI history floats upward over the dockview content when expanded —
          absolute so it doesn't push the layout. The toolbar row below
          stays fixed-height. */}
      {mode === "ai" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center px-4 pb-2">
          <div className="pointer-events-auto w-full max-w-2xl">
            <AiToolbarHistory chat={chat} />
          </div>
        </div>
      )}

      {/* Toolbar row — fixed-width content, centered. The row itself spans
          full width so the chrome (border-top + bg) reads as a real bottom
          bar instead of a floating pill. */}
      <div className="flex justify-center px-4 py-2">
        <TooltipProvider delay={400}>
          {mode === "edit" ? (
            <div className="flex h-10 w-[640px] items-center gap-2 rounded-lg border border-border bg-card px-2 shadow-sm">
              <ModeToggle mode={mode} onModeChange={setMode} />
              <Separator orientation="vertical" className="h-6" />
              <EditToolbar />
              <Separator orientation="vertical" className="h-6" />
              <PlayControls sim={sim} />
              {/* Fixed-width status slot, pinned to the right edge. */}
              <div className="ml-auto">
                <StatusDisplay sim={sim} />
              </div>
            </div>
          ) : (
            <div className="w-[640px]">
              <PromptBox
                value={chat.inputValue}
                onChange={chat.setInputValue}
                onSubmit={chat.handleSubmit}
                onStop={chat.stop}
                isStreaming={chat.status === "streaming" || chat.status === "submitted"}
                placeholder="e.g. 'what librarys should i use for this project?', 'help me build a temperature sensor circuit' , or 'what's wrong with my design?'"
                leading={<ModeToggle mode={mode} onModeChange={setMode} />}
              />
            </div>
          )}
        </TooltipProvider>
      </div>
    </div>
  )
}

import { useState } from "react"
import { Pencil, Sparkles, Cloud } from "lucide-react"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PromptBox } from "@/chat/prompt-box"
import { EditToolbar } from "./edit-toolbar"
import { PlayControls } from "./play-controls"
import { BoardStatus } from "./board-status"
import { AiToolbarHistory } from "./ai-toolbar"
import { useChatMessages } from "./use-chat-messages"
import { useCapabilities } from "@/project/use-capabilities"

/**
 * Small indicator shown in hosted (Railway/etc) deployments. Same React
 * bundle ships in the CLI binary — this component renders nothing there.
 * The pill tells power users why the library Download button is missing
 * and gives a subtle path toward the local CLI for full features.
 */
function HostedIndicator() {
  const { capabilities } = useCapabilities()
  if (!capabilities.hosted) return null
  return (
    <span
      className="flex items-center gap-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
      title="Running on a hosted server. Libraries are pre-installed and fixed. Download the Dreamer CLI for the full library index."
    >
      <Cloud className="size-3" /> Hosted
    </span>
  )
}

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

  return (
    <div className="absolute bottom-4 left-0 right-0 z-40 flex flex-col items-center pointer-events-none px-4">
      {/* AI message history floats above */}
      {mode === "ai" && (
        <div className="pointer-events-auto">
          <AiToolbarHistory chat={chat} />
        </div>
      )}

      {/* Toolbar */}
      <div className="pointer-events-auto w-full max-w-2xl">
        <TooltipProvider delay={400}>
          {mode === "edit" ? (
            <div className="bg-card border border-border rounded-xl shadow-lg flex items-center gap-2 px-2 py-1.5 w-fit mx-auto">
              <ModeToggle mode={mode} onModeChange={setMode} />
              <Separator orientation="vertical" className="h-6" />
              <EditToolbar />
              <Separator orientation="vertical" className="h-6" />
              <PlayControls />
              <Separator orientation="vertical" className="h-6" />
              <BoardStatus />
              <HostedIndicator />
            </div>
          ) : (
            <PromptBox
              value={chat.inputValue}
              onChange={chat.setInputValue}
              onSubmit={chat.handleSubmit}
              onStop={chat.stop}
              isStreaming={chat.status === "streaming" || chat.status === "submitted"}
              placeholder="e.g. 'what librarys should i use for this project?', 'help me build a temperature sensor circuit' , or 'what's wrong with my design?'"
              leading={<ModeToggle mode={mode} onModeChange={setMode} />}
            />
          )}
        </TooltipProvider>
      </div>
    </div>
  )
}

import { useState, useRef, useEffect } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import Markdown from "react-markdown"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { TokenTracker } from "@/chat/token-tracker"
import type { UseChatMessagesReturn } from "./use-chat-messages"

type AiToolbarProps = {
  chat: UseChatMessagesReturn
}

/** Extract the concatenated text from a UIMessage's parts. */
function getMessageText(msg: UseChatMessagesReturn["messages"][number]): string {
  return msg.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("")
}

/**
 * Vercel AI SDK v5 streams `tool-<toolName>` parts on assistant
 * messages. We narrow structurally — the SDK's union typing doesn't
 * surface `state` / `toolCallId` after a pattern-match on `type`.
 */
type ToolCallPart = {
  type: string
  state: string
  toolCallId?: string
}

function isToolCallPart(part: unknown): part is ToolCallPart {
  if (typeof part !== "object" || part === null) return false
  const p = part as { type?: unknown; state?: unknown }
  return (
    typeof p.type === "string" &&
    p.type.startsWith("tool-") &&
    typeof p.state === "string"
  )
}

function partToolName(part: ToolCallPart): string {
  return part.type.slice("tool-".length)
}

function stateIcon(state: string): string {
  switch (state) {
    case "input-streaming":
      return "⏵"
    case "input-available":
      return "▶"
    case "output-available":
      return "✓"
    default:
      return "•"
  }
}

function isToolInFlight(state: string): boolean {
  return state === "input-streaming" || state === "input-available"
}

/**
 * Find the tool currently being called by the most recent assistant
 * message. Used to swap the generic "Thinking..." pulse for a specific
 * "Using <toolName>..." indicator during the stream.
 */
function activeToolName(
  messages: UseChatMessagesReturn["messages"],
): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (!msg || msg.role !== "assistant") continue
    for (const part of msg.parts) {
      if (isToolCallPart(part) && isToolInFlight(part.state)) {
        return partToolName(part)
      }
    }
    return null
  }
  return null
}

export function AiToolbarHistory({ chat }: AiToolbarProps) {
  const { messages, status } = chat
  const bottomRef = useRef<HTMLDivElement>(null)
  const [historyOpen, setHistoryOpen] = useState(true)
  const hasMessages = messages.length > 0

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  if (!hasMessages) return null

  if (!historyOpen) {
    // Collapsed pill — previously left-aligned against the 2xl parent
    // and rendered in muted-xs, so it was easy to miss. Now centered in
    // its own flex row with foreground text, an up-chevron affordance,
    // and a visible hover state.
    return (
      <div className="mb-2 flex justify-center">
        <button
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-md transition-colors hover:bg-muted cursor-pointer"
        >
          <ChevronUp className="size-3.5 text-muted-foreground" />
          Show messages ({messages.length})
        </button>
      </div>
    )
  }

  const isStreaming = status === "streaming" || status === "submitted"

  return (
    <div className="w-full max-w-2xl mb-2">
      {/* Chat-card chrome: lighter shadow than the PromptBox below so
          the pair stacks as anchor + follower rather than two loud
          marketing panels. Header dropped — the ModeToggle already
          tells the user they're in chat. Hide is a floating chevron
          over the scroll area. Token counter is a sticky footer so it
          stays in view when the scroll area is full. */}
      <div className="relative bg-card border border-border rounded-lg shadow-md overflow-hidden">
        <button
          onClick={() => setHistoryOpen(false)}
          aria-label="Hide messages"
          className="absolute right-1.5 top-1.5 z-10 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
        >
          <ChevronDown className="size-3.5" />
        </button>
        <ScrollArea className="max-h-96">
          <div className="px-3 py-2 pr-8">
            {messages.map((msg) => {
              const text = getMessageText(msg)
              const toolParts: ToolCallPart[] = []
              for (const part of msg.parts) {
                if (isToolCallPart(part)) toolParts.push(part)
              }
              if (!text && toolParts.length === 0) return null
              return (
                <div key={msg.id} className="mb-3 last:mb-0">
                  {text && (
                    <div
                      className={cn(
                        "text-sm leading-relaxed rounded-md",
                        msg.role === "user"
                          ? "bg-accent px-2.5 py-1.5"
                          : "text-muted-foreground py-1 prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-foreground prose-headings:text-foreground prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:rounded"
                      )}
                    >
                      {msg.role === "user" ? text : <Markdown>{text}</Markdown>}
                    </div>
                  )}
                  {/* Inline tool-activity list. Tool name only — args
                      (huge sketches) + outputs (already reflected in
                      board diff) would be noise. */}
                  {toolParts.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {toolParts.map((part) => (
                        <div
                          key={part.toolCallId ?? `${part.type}-${part.state}`}
                          className="text-xs italic text-muted-foreground/80 font-mono"
                        >
                          {stateIcon(part.state)} {partToolName(part)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {isStreaming && (() => {
              const tool = activeToolName(messages)
              return (
                <div className="text-xs text-muted-foreground animate-pulse py-1 font-mono">
                  {tool ? `Using ${tool}...` : "Thinking..."}
                </div>
              )
            })()}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
        <div className="border-t border-border px-3 py-1.5">
          <TokenTracker sessionTokenUsage={chat.sessionTokenUsage} />
        </div>
      </div>
    </div>
  )
}

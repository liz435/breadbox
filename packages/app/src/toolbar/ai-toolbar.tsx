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
              if (!text) return null
              return (
                <div key={msg.id} className="mb-3 last:mb-0">
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
                </div>
              )
            })}
            {isStreaming && (
              <div className="text-xs text-muted-foreground animate-pulse py-1">
                Thinking...
              </div>
            )}
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

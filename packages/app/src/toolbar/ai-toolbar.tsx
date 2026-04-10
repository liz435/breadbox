import { useState, useRef, useEffect } from "react"
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
    return (
      <button
        onClick={() => setHistoryOpen(true)}
        className="mb-2 text-xs text-muted-foreground hover:text-foreground bg-card border border-border rounded-full px-3 py-1 shadow cursor-pointer"
      >
        Show messages ({messages.length})
      </button>
    )
  }

  const isStreaming = status === "streaming" || status === "submitted"

  return (
    <div className="w-full max-w-2xl mb-2">
      <div className="bg-card border border-border rounded-lg shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground">
            Dreamer Agent
          </span>
          <button
            onClick={() => setHistoryOpen(false)}
            className="text-muted-foreground hover:text-foreground text-xs px-1 cursor-pointer"
          >
            Hide
          </button>
        </div>
        <ScrollArea className="max-h-96">
          <div className="px-3 py-2">
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
            <TokenTracker
              sessionTokenUsage={chat.sessionTokenUsage}
              className="pt-1 border-t border-border mt-2"
            />
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

import { useRef, useEffect, useCallback } from "react"
import { ArrowUp, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type PromptBoxProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop?: () => void
  placeholder?: string
  disabled?: boolean
  isStreaming?: boolean
  leading?: React.ReactNode
}

export function PromptBox({
  value,
  onChange,
  onSubmit,
  onStop,
  placeholder = "Describe what you want to create...",
  disabled = false,
  isStreaming = false,
  leading,
}: PromptBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "0"
    const next = Math.min(el.scrollHeight, 192) // max ~12rem
    el.style.height = `${next}px`
  }, [])

  useEffect(() => {
    resize()
  }, [value, resize])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && !isStreaming && value.trim()) {
        onSubmit()
      }
    }
  }

  const canSend = !disabled && !isStreaming && value.trim().length > 0

  return (
    <div
      className={cn(
        // shadow-md (was shadow-lg): matches the history card's weight so
        // the stack reads as one coherent surface rather than a heavy
        // floating slab, especially in the empty state where this is the
        // only card on screen.
        "w-full max-w-2xl mx-auto rounded-lg border border-border bg-card p-3 shadow-md",
        "transition-all duration-200",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isStreaming ? "Thinking..." : placeholder}
        disabled={disabled || isStreaming}
        rows={1}
        className={cn(
          "w-full resize-none bg-transparent text-sm text-foreground",
          "placeholder:text-muted-foreground",
          "focus:outline-none",
          "disabled:cursor-not-allowed",
          "min-h-[2.5rem] max-h-48"
        )}
      />
      <div className="flex items-center mt-2 gap-2">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="flex-1" />
        {isStreaming ? (
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            onClick={onStop}
            aria-label="Stop"
            className="rounded-full size-8"
          >
            <Square className="size-3.5" fill="currentColor" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon-sm"
            disabled={!canSend}
            onClick={onSubmit}
            aria-label="Send"
            className="rounded-full size-8"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

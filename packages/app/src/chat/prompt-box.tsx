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
    const next = Math.min(el.scrollHeight, 160) // max ~10rem
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
    // Chrome-less horizontal row: the bottom-toolbar shell owns the pill's
    // border/bg/shadow/radius, so this just lays out [leading] [textarea] [send]
    // in one line that sits inside the shared 640px pill at its resting height.
    // The textarea still auto-grows for multi-line input, expanding the pill
    // downward without changing the mode-switch footprint.
    <div
      className={cn(
        "flex w-full items-center gap-2",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isStreaming ? "Thinking..." : placeholder}
        disabled={disabled || isStreaming}
        rows={1}
        className={cn(
          "min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-6 text-foreground",
          "placeholder:text-muted-foreground",
          "focus:outline-none",
          "disabled:cursor-not-allowed",
          "max-h-40"
        )}
      />
      {isStreaming ? (
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          onClick={onStop}
          aria-label="Stop"
          className="shrink-0 rounded-full size-8"
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
          className="shrink-0 rounded-full size-8"
        >
          <ArrowUp className="size-4" />
        </Button>
      )}
    </div>
  )
}

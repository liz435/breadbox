import { useRef, useEffect } from "react"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { PromptBox } from "@/chat/prompt-box"
import type { UseCharacterChatReturn } from "./use-character-chat"

type CharacterChatPanelProps = {
  chat: UseCharacterChatReturn
}

type MessageType = UseCharacterChatReturn["messages"][number]
type PartType = MessageType["parts"][number]

// ── Tool part normalization ─────────────────────────────────────────────────
// The AI SDK emits tool parts in two shapes:
//   - static:  { type: "tool-generate_image", toolCallId, state, input, output }
//              tool name is encoded in the type string, no toolName field
//   - dynamic: { type: "dynamic-tool", toolName, toolCallId, state, input, output }
//
// We normalize both into ToolPartData for rendering.

type ToolPartData = {
  toolName: string
  toolCallId: string
  state: string
  input: unknown
  output: unknown
  errorText?: string
}

function getToolPartData(part: PartType): ToolPartData | null {
  if (!("type" in part) || !("state" in part) || !("toolCallId" in part)) return null
  const raw = part as Record<string, unknown>
  const type = raw.type as string

  let toolName: string | null = null
  if (type === "dynamic-tool" && typeof raw.toolName === "string") {
    toolName = raw.toolName
  } else if (type.startsWith("tool-")) {
    toolName = type.slice("tool-".length)
  }
  if (!toolName) return null

  return {
    toolName,
    toolCallId: raw.toolCallId as string,
    state: raw.state as string,
    input: raw.input,
    output: raw.output,
    errorText: raw.errorText as string | undefined,
  }
}

function getMessageToolParts(msg: MessageType): ToolPartData[] {
  const parts: ToolPartData[] = []
  for (const part of msg.parts) {
    const tp = getToolPartData(part)
    if (tp) parts.push(tp)
  }
  return parts
}

// ── Labels ──────────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, { label: string; activeLabel: string }> = {
  generate_image: { label: "Generate Image", activeLabel: "Generating image..." },
  generate_sprite_sheet: { label: "Generate Sprite Sheet", activeLabel: "Generating sprite sheet..." },
  remove_background: { label: "Remove Background", activeLabel: "Removing background..." },
  extract_frames: { label: "Extract Frames", activeLabel: "Extracting frames..." },
}

// ── Text extraction ─────────────────────────────────────────────────────────

function getMessageText(msg: MessageType): string {
  return msg.parts
    .filter((p): p is Extract<PartType, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("")
}

// ── Input param formatters ──────────────────────────────────────────────────

function formatToolInput(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null
  const params = input as Record<string, unknown>

  switch (toolName) {
    case "generate_image": {
      const prompt = params.prompt as string | undefined
      return prompt ? truncate(prompt, 120) : null
    }
    case "generate_sprite_sheet": {
      const animation = params.animation_name as string | undefined
      return animation ? `animation: ${animation}` : null
    }
    case "remove_background":
      return null
    case "extract_frames": {
      const animation = params.animation_name as string | undefined
      return animation ? `animation: ${animation}` : null
    }
    default:
      return null
  }
}

function truncate(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}...`
}

// ── Output result formatters ────────────────────────────────────────────────

function formatToolOutput(toolName: string, output: unknown): string | null {
  if (!output || typeof output !== "object") return null
  const result = output as Record<string, unknown>
  if (result.error) return null

  switch (toolName) {
    case "generate_image": {
      const images = result.images as unknown[] | undefined
      return images ? `${images.length} image(s) generated` : null
    }
    case "generate_sprite_sheet": {
      const anim = result.animationName as string | undefined
      return anim ? `${anim} sprite sheet ready` : "Sprite sheet ready"
    }
    case "remove_background":
      return "Background removed"
    case "extract_frames": {
      const frames = result.frames as unknown[] | undefined
      const anim = result.animationName as string | undefined
      if (frames) return `${frames.length} ${anim ?? ""} frames extracted`.trim()
      return null
    }
    default:
      return null
  }
}

// ── Rich output extractors (images, sheets, frames) ─────────────────────────

function getToolImages(toolParts: ToolPartData[]): { url: string }[] {
  const images: { url: string }[] = []
  for (const tp of toolParts) {
    if (tp.toolName === "generate_image" && tp.state === "output-available") {
      const output = tp.output as { images?: { url: string }[] }
      if (output.images) images.push(...output.images)
    }
  }
  return images
}

type SpriteSheetOutput = { url: string; animationName: string }

function getToolSpriteSheets(toolParts: ToolPartData[]): SpriteSheetOutput[] {
  const sheets: SpriteSheetOutput[] = []
  for (const tp of toolParts) {
    if (tp.toolName === "generate_sprite_sheet" && tp.state === "output-available") {
      const output = tp.output as SpriteSheetOutput
      if (output.url) sheets.push(output)
    }
  }
  return sheets
}

type FrameOutput = { url: string; index: number; width: number; height: number }
type ExtractedFramesOutput = { animationName: string; frames: FrameOutput[] }

function getToolFrames(toolParts: ToolPartData[]): ExtractedFramesOutput[] {
  const results: ExtractedFramesOutput[] = []
  for (const tp of toolParts) {
    if (tp.toolName === "extract_frames" && tp.state === "output-available") {
      const output = tp.output as ExtractedFramesOutput
      if (output.frames) results.push(output)
    }
  }
  return results
}

// ── Tool call card ──────────────────────────────────────────────────────────

function ToolCallCard({ part }: { part: ToolPartData }) {
  const labels = TOOL_LABELS[part.toolName]
  const label = labels?.label ?? part.toolName

  const isActive = part.state === "input-streaming" || part.state === "input-available"
  const isDone = part.state === "output-available"
  const isError = part.state === "output-error"

  const inputSummary = formatToolInput(part.toolName, part.input)
  const outputSummary = isDone ? formatToolOutput(part.toolName, part.output) : null

  return (
    <div className="my-1.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        {isActive && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        {isDone && <CheckCircle2 className="size-3 text-green-500" />}
        {isError && <XCircle className="size-3 text-red-500" />}
        <span className={cn(
          "font-medium",
          isActive && "text-muted-foreground",
          isDone && "text-foreground",
          isError && "text-red-500",
        )}>
          {isActive ? (labels?.activeLabel ?? `Running ${part.toolName}...`) : label}
        </span>
      </div>
      {inputSummary && (
        <div className="mt-1 text-muted-foreground pl-5 break-words">
          {inputSummary}
        </div>
      )}
      {outputSummary && (
        <div className="mt-1 text-muted-foreground pl-5">
          {outputSummary}
        </div>
      )}
      {isError && (
        <div className="mt-1 text-red-500 pl-5">
          {part.errorText ?? "Unknown error"}
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function CharacterChatPanel({ chat }: CharacterChatPanelProps) {
  const {
    messages,
    status,
    inputValue,
    setInputValue,
    handleSubmit,
    stop,
    isLoadingSession,
  } = chat
  const bottomRef = useRef<HTMLDivElement>(null)
  const isStreaming = status === "streaming" || status === "submitted"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-foreground">
          Character Creator
        </h2>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
        {isLoadingSession && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="size-4 animate-spin" />
            Loading session...
          </div>
        )}
        {!isLoadingSession && messages.length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Describe a character and I'll generate it for you
          </div>
        )}
        {messages.map((msg) => {
          const text = getMessageText(msg)
          const toolParts = getMessageToolParts(msg)
          const images = getToolImages(toolParts)
          const spriteSheets = getToolSpriteSheets(toolParts)
          const extractedFrames = getToolFrames(toolParts)

          const hasContent =
            text ||
            toolParts.length > 0 ||
            images.length > 0 ||
            spriteSheets.length > 0 ||
            extractedFrames.length > 0
          if (!hasContent) return null

          return (
            <div key={msg.id} className="mb-4 last:mb-0">
              {text && (
                <div
                  className={cn(
                    "text-sm leading-relaxed rounded-md",
                    msg.role === "user"
                      ? "bg-accent px-2.5 py-1.5"
                      : "text-muted-foreground py-1"
                  )}
                >
                  {text}
                </div>
              )}
              {toolParts.map((tp) => (
                <ToolCallCard key={tp.toolCallId} part={tp} />
              ))}
              {images.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {images.map((img, i) => (
                    <img
                      key={i}
                      src={img.url}
                      alt="Generated character"
                      className="rounded-lg border border-border max-w-[280px]"
                    />
                  ))}
                </div>
              )}
              {spriteSheets.map((sheet, i) => (
                <div key={`sheet-${i}`} className="mt-2">
                  <div className="text-xs text-muted-foreground mb-1">
                    {sheet.animationName} sprite sheet
                  </div>
                  <img
                    src={sheet.url}
                    alt={`${sheet.animationName} sprite sheet`}
                    className="rounded-lg border border-border max-w-[280px]"
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
              ))}
              {extractedFrames.map((result, i) => (
                <div key={`frames-${i}`} className="mt-2">
                  <div className="text-xs text-muted-foreground mb-1">
                    {result.animationName} frames
                  </div>
                  <div className="flex gap-1">
                    {result.frames.map((frame) => (
                      <img
                        key={frame.index}
                        src={frame.url}
                        alt={`${result.animationName} frame ${frame.index + 1}`}
                        className="border border-border rounded"
                        style={{
                          imageRendering: "pixelated",
                          width: 64,
                          height: 64,
                          objectFit: "contain",
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
        {isStreaming && messages.length > 0 && (() => {
          const lastMsg = messages[messages.length - 1]
          const lastToolParts = getMessageToolParts(lastMsg)
          const hasActiveTool = lastToolParts.some(
            (tp) => tp.state === "input-streaming" || tp.state === "input-available"
          )
          if (hasActiveTool) return null
          return (
            <div className="text-xs text-muted-foreground animate-pulse py-1">
              Thinking...
            </div>
          )
        })()}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-border shrink-0">
        <PromptBox
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          onStop={stop}
          isStreaming={isStreaming}
          placeholder="Describe your character..."
        />
      </div>
    </div>
  )
}

import { cn } from "@/lib/utils"
import type { SessionTokenUsage } from "@/toolbar/use-chat-messages"

type TokenTrackerProps = {
  sessionTokenUsage: SessionTokenUsage
  className?: string
}

// Pricing per million tokens
const SONNET_INPUT_COST = 3 // $/M
const SONNET_OUTPUT_COST = 15 // $/M
const HAIKU_INPUT_COST = 0.8 // $/M
const HAIKU_OUTPUT_COST = 4 // $/M

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`
  return String(count)
}

function computeCost(session: SessionTokenUsage): number {
  const sonnetCost =
    (session.sonnet.inputTokens / 1_000_000) * SONNET_INPUT_COST +
    (session.sonnet.outputTokens / 1_000_000) * SONNET_OUTPUT_COST
  const haikuCost =
    (session.haiku.inputTokens / 1_000_000) * HAIKU_INPUT_COST +
    (session.haiku.outputTokens / 1_000_000) * HAIKU_OUTPUT_COST
  return sonnetCost + haikuCost
}

function formatCost(cost: number): string {
  if (cost < 0.005) return "<$0.01"
  return `$${cost.toFixed(2)}`
}

export function TokenTracker({ sessionTokenUsage, className }: TokenTrackerProps) {
  const sonnetTotal = sessionTokenUsage.sonnet.inputTokens + sessionTokenUsage.sonnet.outputTokens
  const haikuTotal = sessionTokenUsage.haiku.inputTokens + sessionTokenUsage.haiku.outputTokens

  if (sonnetTotal === 0 && haikuTotal === 0) return null

  const cost = computeCost(sessionTokenUsage)

  return (
    <div className={cn("flex items-center gap-2 text-[10px] text-muted-foreground", className)}>
      {sonnetTotal > 0 && (
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-1.5 rounded-full bg-purple-500" />
          <span>Sonnet {formatTokenCount(sonnetTotal)} tokens</span>
        </span>
      )}
      {haikuTotal > 0 && (
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-1.5 rounded-full bg-green-500" />
          <span>Haiku {formatTokenCount(haikuTotal)} tokens</span>
        </span>
      )}
      <span className="text-muted-foreground/60">{formatCost(cost)}</span>
    </div>
  )
}

import { cn } from "@/lib/utils"
import type { SessionTokenUsage } from "@/toolbar/use-chat-messages"

type TokenTrackerProps = {
  sessionTokenUsage: SessionTokenUsage
  className?: string
}

// KEEP IN SYNC with packages/api/src/billing/pricing-config.ts.
// Mirror of the server's MODEL_RATES + LLM_MARKUP_FACTOR so the chip can
// preview credit cost without a round trip. The wallet endpoint remains
// source of truth — this is for inline feedback only.
const SONNET_INPUT_COST = 3 // $/M
const SONNET_OUTPUT_COST = 15 // $/M
const HAIKU_INPUT_COST = 1 // $/M
const HAIKU_OUTPUT_COST = 5 // $/M
const LLM_MARKUP_FACTOR = 320

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

// Credits charged this session, approximated from session totals. The
// server actually charges max(1, ceil(usd × markup)) per run, so summing
// at session level rounds slightly differently than the per-run truth —
// the wallet chip is canonical. Off-by-a-few-credits is acceptable here.
function computeCredits(session: SessionTokenUsage): number {
  return Math.max(0, Math.ceil(computeCost(session) * LLM_MARKUP_FACTOR))
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
  const credits = computeCredits(sessionTokenUsage)

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
      <span className="text-muted-foreground/60">
        {formatCost(cost)} · {credits} {credits === 1 ? "credit" : "credits"}
      </span>
    </div>
  )
}

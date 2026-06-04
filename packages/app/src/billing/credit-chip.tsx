// ── CreditChip ───────────────────────────────────────────────────────────
//
// Compact balance indicator that lives next to the AuthStatusBadge in
// the bottom toolbar. Three render states:
//
//   loading              → "·" placeholder so layout doesn't jump
//   unlimited (CLI/dev)  → not rendered (no chip; saves space)
//   credits              → coin glyph + odometer balance, color-tinted by
//                          remaining balance to nudge before the 402
//
// The balance uses RollingNumber: after a run the wallet refetches and the
// digits scroll down to the new total. Tone (red/amber/normal) tints both
// the coin and the digits so a low balance reads at a glance.
//
// No interactivity in v1 — clicking goes nowhere because there's no
// purchase flow yet. When paid tiers arrive this becomes a button that
// opens the buy-credits modal.

import { Coins } from "lucide-react"
import { cn } from "@/utils/classnames"
import { RollingNumber } from "./rolling-number"
import { useWallet } from "./use-wallet"

const pillBase =
  "pointer-events-auto inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs shadow-sm tabular-nums"

export function CreditChip() {
  const { balancePosted, currency, loading } = useWallet()

  if (loading) {
    return (
      <div className={cn(pillBase, "text-muted-foreground/60")} aria-hidden>
        ·
      </div>
    )
  }
  if (currency === "unlimited" || balancePosted === null) {
    // CLI / dev mode: no chip. The auth badge already says "Dev mode".
    return null
  }

  const tone =
    balancePosted <= 0
      ? "text-red-500"
      : balancePosted < 50
        ? "text-amber-500"
        : "text-foreground"

  return (
    <div
      className={cn(pillBase, tone)}
      aria-label={`${balancePosted.toLocaleString()} credits remaining`}
    >
      <Coins className="size-3.5 shrink-0 opacity-80" aria-hidden />
      <RollingNumber
        value={balancePosted}
        className="font-semibold tracking-tight"
      />
      <span className="text-[11px] font-medium text-muted-foreground">
        credits
      </span>
    </div>
  )
}

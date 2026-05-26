// ── CreditChip ───────────────────────────────────────────────────────────
//
// Compact balance indicator that lives next to the AuthStatusBadge in
// the bottom toolbar. Three render states:
//
//   loading              → "·" placeholder so layout doesn't jump
//   unlimited (CLI/dev)  → not rendered (no chip; saves space)
//   credits              → "N credits" pill, color-tinted by remaining
//                          balance to nudge before the 402
//
// No interactivity in v1 — clicking goes nowhere because there's no
// purchase flow yet. When paid tiers arrive this becomes a button that
// opens the buy-credits modal.

import { cn } from "@/utils/classnames"
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
      className={cn(pillBase, "font-medium", tone)}
      aria-label={`${balancePosted} credits remaining`}
    >
      <span>{balancePosted.toLocaleString()}</span>
      <span className="text-muted-foreground">credits</span>
    </div>
  )
}

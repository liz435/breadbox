// ── useWallet ────────────────────────────────────────────────────────────
//
// Reads `/api/billing/wallet` on first read, caches in module state, and
// publishes via `useSyncExternalStore` so the credit chip can subscribe
// without prop drilling. Mirrors the shape of `use-current-user.ts` —
// lazy-on-mount, no `useEffect` for derived state, synchronous
// snapshot accessor for non-React callers.
//
// Hosted: balancePosted is a number ≥ 0 (or negative if a run
// overdrafted).
// CLI / unlimited: balancePosted is `null` and `currency === 'unlimited'`.

import { useSyncExternalStore } from "react"
import { API_ORIGIN } from "@dreamer/config"

export type WalletResponse = {
  balancePosted: number | null
  currency: "credits" | "unlimited"
  updatedAt?: string | null
}

const DEFAULT_RESPONSE: WalletResponse = {
  balancePosted: null,
  currency: "unlimited",
}

let promiseCache: Promise<WalletResponse> | null = null
let snapshotCache: WalletResponse | null = null
const subscribers = new Set<() => void>()

function notify(): void {
  for (const fn of subscribers) fn()
}

async function fetchWallet(): Promise<WalletResponse> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/billing/wallet`, {
      credentials: "include",
    })
    if (!res.ok) {
      snapshotCache = DEFAULT_RESPONSE
      notify()
      return DEFAULT_RESPONSE
    }
    const data = (await res.json()) as Partial<WalletResponse>
    const parsed: WalletResponse = {
      balancePosted:
        typeof data.balancePosted === "number" ? data.balancePosted : null,
      currency: data.currency === "credits" ? "credits" : "unlimited",
      updatedAt: data.updatedAt ?? null,
    }
    snapshotCache = parsed
    notify()
    return parsed
  } catch {
    snapshotCache = DEFAULT_RESPONSE
    notify()
    return DEFAULT_RESPONSE
  }
}

function ensureFetch(): Promise<WalletResponse> {
  if (!promiseCache) promiseCache = fetchWallet()
  return promiseCache
}

// Refresh on tab visibility change. After an agent run drops the
// balance server-side, the user usually switches away from the tab and
// back — refreshing on focus picks up the new number without a poll.
// Idempotent and shared across all subscribers.
let visibilityHookInstalled = false
function ensureVisibilityHook(): void {
  if (visibilityHookInstalled) return
  if (typeof document === "undefined") return
  visibilityHookInstalled = true
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void refreshWallet()
    }
  })
}

function subscribe(onStoreChange: () => void): () => void {
  void ensureFetch()
  ensureVisibilityHook()
  subscribers.add(onStoreChange)
  return () => {
    subscribers.delete(onStoreChange)
  }
}

/**
 * Re-fetch the wallet. Call after a successful agent run (the balance
 * just dropped) or after a 402 (the user's perception of their balance
 * is wrong).
 *
 * We deliberately keep `snapshotCache` (the previously-fetched balance)
 * in place while the new value loads instead of blanking it. That keeps
 * the CreditChip mounted showing the old total, so when the new total
 * arrives the RollingNumber reels animate from old → new rather than
 * flickering through the loading placeholder and snapping to the result.
 */
export function refreshWallet(): Promise<WalletResponse> {
  promiseCache = null
  const next = ensureFetch()
  return next
}

export function useWallet(): {
  balancePosted: number | null
  currency: "credits" | "unlimited"
  loading: boolean
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => snapshotCache,
    () => null,
  )
  if (snapshot) {
    return {
      balancePosted: snapshot.balancePosted,
      currency: snapshot.currency,
      loading: false,
    }
  }
  return { balancePosted: null, currency: "unlimited", loading: true }
}

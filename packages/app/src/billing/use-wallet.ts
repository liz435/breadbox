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

function subscribe(onStoreChange: () => void): () => void {
  void ensureFetch()
  subscribers.add(onStoreChange)
  return () => {
    subscribers.delete(onStoreChange)
  }
}

/**
 * Invalidate the cached wallet so the next render re-fetches. Call
 * after a successful agent run (the balance just dropped) or after a
 * 402 (the user's perception of their balance is wrong).
 */
export function refreshWallet(): Promise<WalletResponse> {
  promiseCache = null
  snapshotCache = null
  const next = ensureFetch()
  notify()
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

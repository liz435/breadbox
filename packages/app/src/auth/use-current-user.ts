// ── useCurrentUser ───────────────────────────────────────────────────────
//
// Reads `/api/auth/me` once via a module-level promise cache and serves
// the cached snapshot to every consumer synchronously thereafter. The
// App gate uses this to decide between LoginScreen / LocalNoSession /
// AppInner.
//
// Design:
//   - The fetch is kicked off lazily on first read, then cached. A
//     `useSyncExternalStore` subscription drives re-renders when the
//     promise resolves or `refreshCurrentUser()` invalidates the cache.
//   - No `useEffect` for derived state — per CLAUDE.md, the gate derives
//     directly from the hook's return value.
//   - `loading` is true only on the very first read before the promise
//     resolves. Once resolved, it stays false until `refreshCurrentUser`
//     is called (after sign-out).
//   - React 19's `use()` is available, but we deliberately don't suspend
//     the root tree on boot: the App gate wants to render its own splash
//     during the initial read rather than blow up a parent Suspense
//     boundary. The `use()` import stays as an escape hatch for consumers
//     that prefer Suspense semantics; the hook itself never calls it.
//
// Failure mode: a 401 or network error resolves to the safe default
// `{ user: null, mode: "hosted" }` so the UI falls through to a login
// screen rather than throwing. `/api/auth/me` never 401s in practice
// (it's a discovery endpoint), so "401 here" really means an edge or
// proxy misconfiguration.

import { useSyncExternalStore } from "react"
import { API_ORIGIN } from "@dreamer/config"

export type AuthMode = "hosted" | "local" | "dev"

export type CurrentUser = {
  userId: string
  githubLogin?: string
}

export type AuthMeResponse = {
  user: CurrentUser | null
  mode: AuthMode
  /** CLI/desktop only: whether an Anthropic API key is configured. */
  hasApiKey?: boolean
}

const DEFAULT_RESPONSE: AuthMeResponse = { user: null, mode: "hosted" }

let promiseCache: Promise<AuthMeResponse> | null = null
let snapshotCache: AuthMeResponse | null = null
const subscribers = new Set<() => void>()

function notify(): void {
  for (const fn of subscribers) fn()
}

async function fetchAuthMe(): Promise<AuthMeResponse> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/auth/me`, {
      credentials: "include",
    })
    if (!res.ok) {
      snapshotCache = DEFAULT_RESPONSE
      notify()
      return DEFAULT_RESPONSE
    }
    const data = (await res.json()) as Partial<AuthMeResponse>
    const mode: AuthMode =
      data.mode === "hosted" || data.mode === "local" || data.mode === "dev"
        ? data.mode
        : "hosted"
    const parsed: AuthMeResponse = {
      user: data.user ?? null,
      mode,
      hasApiKey: data.hasApiKey ?? false,
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

function ensureFetch(): Promise<AuthMeResponse> {
  if (!promiseCache) promiseCache = fetchAuthMe()
  return promiseCache
}

function subscribe(onStoreChange: () => void): () => void {
  // First subscriber triggers the lazy fetch. Subsequent subscribers
  // just attach to the existing promise — the snapshot will notify
  // them when it arrives.
  void ensureFetch()
  subscribers.add(onStoreChange)
  return () => {
    subscribers.delete(onStoreChange)
  }
}

/**
 * Invalidate the cached `/api/auth/me` response. Call after sign-in /
 * sign-out so the next read refetches and notifies every subscribed
 * gate to re-render.
 */
export function refreshCurrentUser(): Promise<AuthMeResponse> {
  promiseCache = null
  snapshotCache = null
  // Kick off the next fetch immediately so listeners don't wait for
  // the next mount to re-subscribe.
  const next = ensureFetch()
  notify()
  return next
}

/**
 * Read current auth state. Returns `{ loading: true }` on the first
 * mount before the promise resolves; stable snapshots thereafter.
 */
export function useCurrentUser(): {
  user: CurrentUser | null
  mode: AuthMode
  hasApiKey: boolean
  loading: boolean
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => snapshotCache,
    () => null,
  )

  if (snapshot) {
    return {
      user: snapshot.user,
      mode: snapshot.mode,
      hasApiKey: snapshot.hasApiKey ?? false,
      loading: false,
    }
  }

  return { user: null, mode: "hosted", hasApiKey: false, loading: true }
}

/**
 * Synchronous access to the current auth snapshot for non-React code
 * (api-client, toast handlers, etc). Returns null if the /me fetch
 * hasn't resolved yet — callers treat that as "assume hosted + logged
 * out" unless they know better.
 */
export function getCurrentUserSnapshot(): AuthMeResponse | null {
  return snapshotCache
}

/**
 * True when the page is viewing the app as an anonymous visitor on a
 * hosted deployment — the "preview" mode. Callers use this to decide
 * whether to make authed API calls, show sign-in prompts, or treat
 * the project as ephemeral in-memory state.
 */
export function isAnonymousPreview(): boolean {
  const snap = snapshotCache
  if (!snap) return false
  return snap.mode === "hosted" && snap.user === null
}

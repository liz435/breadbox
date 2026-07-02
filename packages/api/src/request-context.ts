// ── Request-scoped context (AsyncLocalStorage) ──────────────────────────
//
// Threads `{ userId, requestId }` through the async call stack of a
// single request without explicit plumbing. The Elysia middleware
// (`requestContextPlugin`) enters the context on every request and
// downstream code reads it via `getRequestContext()`. Used by the
// audit log writer to stamp `user_id` / `request_id` on every record.
//
// Bun's `node:async_hooks` works the same as Node — values set in
// `als.run(value, fn)` are visible to every async continuation that
// resumes inside `fn`, including promise chains and timers, without
// leaking across unrelated requests.

import { AsyncLocalStorage } from "node:async_hooks"
import { Elysia } from "elysia"

export type RequestContext = {
  /** User id from auth middleware (the fixed local-user UUID). */
  userId: string | null
  /** Per-request opaque id for log correlation. Generated on entry. */
  requestId: string
}

const als = new AsyncLocalStorage<RequestContext>()

/**
 * Read the active request's context. Returns `null` when called outside
 * any request scope (boot-time logs, background tasks) — callers
 * decide whether to attribute or leave the field empty.
 */
export function getRequestContext(): RequestContext | null {
  return als.getStore() ?? null
}

/**
 * Run `fn` with `ctx` as the active request context. Used by tests and
 * background workers that want to attribute logs to a synthetic
 * request. Production traffic goes through `requestContextPlugin`.
 */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn)
}

/**
 * Elysia plugin: enters a fresh RequestContext on every request. Reads
 * the verified `auth.userId` from the surrounding auth context if it
 * exists (set by the auth middleware in an earlier `.derive`). Must be
 * mounted AFTER the auth plugin so the userId is populated.
 */
export const requestContextPlugin = new Elysia({
  name: "request-context",
}).onTransform({ as: "global" }, (ctx) => {
  const auth = (ctx as { auth?: { userId?: string | null } | null }).auth
  const userId = auth?.userId ?? null
  const requestId = crypto.randomUUID()
  // `onTransform` runs once per request before the route handler. We
  // can't wrap the rest of the request in `als.run(...)` from a hook
  // (Elysia's lifecycle is callback-based, not nested), so we use
  // `als.enterWith` — a single-arg variant that installs the store on
  // the current async resource and propagates to all continuations
  // spawned afterward. Available on Node ≥ 16 and Bun.
  als.enterWith({ userId, requestId })
})

/** Test-only escape hatch for asserting on the stored context. */
export const _alsForTests = als

// ── Runtime env flags ────────────────────────────────────────────────────
//
// Single source of truth for env-var parsing so routes and services don't
// each reparse `process.env.*` with their own rules. The capabilities
// endpoint derives the client-visible `hosted` flag from this same value,
// so server gates and UI gates can't disagree.

export const IS_HOSTED = process.env.BREADBOX_HOSTED === "1"

/**
 * Default user id used when auth is bypassed (single-tenant CLI/desktop).
 * Stable across processes so file-backed projects on disk keep matching
 * their `ownerId` field. UUID-shaped for compatibility with projects
 * saved by older builds.
 */
export const CLI_LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001"

/**
 * Network interface the API binds to. Default `0.0.0.0`; `dreamer headed`
 * sets `127.0.0.1` so the local API is loopback-only and not reachable
 * from the LAN.
 */
export const BREADBOX_BIND: string =
  (process.env.BREADBOX_BIND && process.env.BREADBOX_BIND.trim()) || "0.0.0.0"

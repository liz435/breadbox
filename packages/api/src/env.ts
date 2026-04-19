// ── Runtime env flags ────────────────────────────────────────────────────
//
// Single source of truth for env-var booleans so routes and services don't
// each reparse `process.env.DREAMER_HOSTED === "1"`. The capabilities
// endpoint derives the client-visible `hosted` flag from this same value,
// so server gates and UI gates can't disagree.

export const IS_HOSTED = process.env.DREAMER_HOSTED === "1"

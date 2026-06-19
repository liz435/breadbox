// ── Onboarding state ─────────────────────────────────────────────────────
//
// First-run onboarding for the editor: on a brand-new, empty project we drop a
// ready-to-run blink circuit on the board and walk the user through the UI with
// a lightweight coach-mark tour (see onboarding-tour.tsx). It runs once — gated
// on a persisted flag — and is re-openable anytime from the command palette,
// which dispatches OPEN_ONBOARDING_EVENT (mirrors connect-claude-dialog).

// Structural minimum we actually read — a board is "empty" when nothing has
// been placed. BoardState satisfies this, and it keeps the gating logic pure
// and testable without a full ProjectFile fixture.
type BoardLike = { components: Record<string, unknown> }

/** Window event that re-opens the tour (dispatched by the command palette). */
export const OPEN_ONBOARDING_EVENT = "breadbox:open-onboarding"

/** The catalog board loaded as the first-run tutorial circuit. */
export const ONBOARDING_BOARD_KEY = "01-blink-led"

// Versioned so a future major UI change can re-trigger the tour for everyone by
// bumping the suffix, the same way the dockview layout key is versioned.
const SEEN_KEY = "dreamer:onboarding-seen-v1"

/** Whether the user has already seen (or dismissed) the onboarding tour. */
export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1"
  } catch {
    // Storage unavailable (private mode / SSR) — treat as seen so we never
    // loop the tour on every load when we can't persist the flag.
    return true
  }
}

/** Persist that onboarding has run, so it doesn't auto-start again. */
export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1")
  } catch {
    // Storage unavailable — best effort; the tour just won't be remembered.
  }
}

/** A project counts as "empty" when its board has no components placed yet. */
export function isProjectEmpty(board: BoardLike | undefined): boolean {
  return !board || Object.keys(board.components).length === 0
}

/**
 * Auto-start the tour only on a genuinely fresh start: the seen-flag is unset
 * AND the project has no circuit yet. This keeps returning users — and anyone
 * who already has a board — untouched, so we never clobber real work with the
 * tutorial circuit.
 */
export function shouldAutoStartOnboarding(board: BoardLike | undefined): boolean {
  return !hasSeenOnboarding() && isProjectEmpty(board)
}

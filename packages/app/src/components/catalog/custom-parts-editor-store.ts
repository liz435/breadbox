// ── Custom Parts editor target ──────────────────────────────────────────────
//
// A tiny channel from the palette (and anywhere else) to the Custom Parts
// panel: "open the editor on a new part" or "open this existing part". The
// palette sets the target and focuses the panel; the panel consumes it on
// mount (if it was just opened) and reacts to later requests via subscribe.

export type CustomPartEditTarget = { kind: "new" } | { kind: "edit"; id: string }

let pending: CustomPartEditTarget | null = null
const listeners = new Set<(target: CustomPartEditTarget) => void>()

/** Request the editor open on a target. Notifies a live panel; otherwise queued. */
export function requestCustomPartEditor(target: CustomPartEditTarget): void {
  pending = target
  for (const listener of listeners) listener(target)
}

/** Consume a target queued before the panel mounted (returns it once). */
export function takeCustomPartTarget(): CustomPartEditTarget | null {
  const target = pending
  pending = null
  return target
}

export function subscribeCustomPartEditor(
  listener: (target: CustomPartEditTarget) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

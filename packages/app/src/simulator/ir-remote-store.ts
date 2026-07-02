// ── Virtual IR remote broadcast ──────────────────────────────────────────
//
// A wireless "beam": the most recent IR code fired by a virtual remote
// component. The simulator drains it once per press into every IR receiver
// peripheral (see `writeIrReceiver` in sensor-inputs.ts), mirroring how
// `buttonPressStore` feeds physical button presses into the running sketch.
//
// `seq` increments on every press so the drain fires exactly once per click —
// and so a press made while the sketch is stopped doesn't replay when it
// starts (the drain arms its per-receiver cursor to the current seq the first
// time it sees a receiver).
//
// This is a module-level singleton (not React state) so any remote renderer
// can fire a code without prop-drilling a dispatcher, and so it works in
// read-only learn embeds where the board state isn't mutable.

export type IrBroadcast = { code: number; seq: number; holding: boolean }

let latest: IrBroadcast = { code: 0, seq: 0, holding: false }
const listeners = new Set<() => void>()

export const irRemoteStore = {
  /**
   * Fire an IR code (32-bit NEC value) from a virtual remote button press.
   * The press is considered HELD (the receiver emits NEC repeat frames every
   * ~108 ms) until `endHold()` is called on pointer release.
   */
  broadcast(code: number): void {
    latest = { code: code >>> 0, seq: latest.seq + 1, holding: true }
    for (const listener of listeners) listener()
  },
  /** The remote button was released — stop NEC repeat frames. */
  endHold(): void {
    if (!latest.holding) return
    latest = { ...latest, holding: false }
    for (const listener of listeners) listener()
  },
  getSnapshot(): IrBroadcast {
    return latest
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

import { useSyncExternalStore } from "react"

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

export type IrBroadcast = { code: number; seq: number }

let latest: IrBroadcast = { code: 0, seq: 0 }
const listeners = new Set<() => void>()

export const irRemoteStore = {
  /** Fire an IR code (32-bit NEC value) from a virtual remote button. */
  broadcast(code: number): void {
    latest = { code: code >>> 0, seq: latest.seq + 1 }
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

/**
 * React hook returning the latest broadcast. Re-renders on each press — used by
 * the remote renderer to flash its IR emitter when any button is pressed.
 */
export function useIrBroadcast(): IrBroadcast {
  return useSyncExternalStore(
    irRemoteStore.subscribe,
    irRemoteStore.getSnapshot,
    irRemoteStore.getSnapshot,
  )
}

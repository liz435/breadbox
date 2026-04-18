// ── PinStateStore ──────────────────────────────────────────────────────────
//
// Single source of truth for all 20 Arduino pin values.
//
// Problem it solves:
//   Previously, pin state lived in TWO places:
//   1. The VM stdlib's private `state.pins[]` / `pinModes[]` arrays
//   2. The board XState machine's `pinStates[]` context
//   These had to be kept in sync via callbacks (VM → React) and a manual sync
//   loop (React → VM). The two-store design caused clobber wars, race conditions,
//   and made button/switch input unreliable.
//
// Design:
//   - One store owns all 20 pins. Both the VM and React subscribe to it.
//   - Two write paths:
//       writeFromSketch() — called by digitalWrite/analogWrite/pinMode in stdlib
//       writeExternal()   — called by UI (button press, inspector, circuit solver)
//   - Conflict resolution: the store tracks `mode` per pin. Sketch writes only
//     take effect for pins that aren't externally driven beyond their mode.
//     In practice, the sketch writes OUTPUT pins and external writes INPUT pins,
//     so conflicts are rare. When the sketch sets pinMode OUTPUT, subsequent
//     external writes are ignored (matches real Arduino behavior).
//   - Edge detection for interrupts lives in the store — triggered on every
//     digital value change regardless of source.
//   - React subscribes via `useSyncExternalStore` for zero-latency reads with
//     proper concurrent-mode safety.
//
// Backends:
//   - Transpile mode: store is authoritative. Read/write directly.
//   - AVR mode: the `avr8js` runner owns the ground truth. The store becomes
//     a cached mirror, updated on `onPinChange` callbacks and on external writes
//     (which are forwarded to `avrRunner.setExternalPin`).

import { MAX_ARDUINO_PIN, type PinMode, type PinState } from "@dreamer/schemas"

export type PinSnapshot = {
  pin: number
  mode: PinMode
  digitalValue: 0 | 1
  analogValue: number // 0-1023
  pwmValue: number    // 0-255
  isPwm: boolean
  pwmFrequency: number
}

export type PinStateSnapshot = ReadonlyArray<PinSnapshot>

export type InterruptEntry = {
  pin: number
  mode: "RISING" | "FALLING" | "CHANGE" | "LOW" | "NONE"
  callback: () => void
}

type Listener = () => void

function createDefaultPin(pin: number): PinSnapshot {
  return {
    pin,
    mode: "UNSET",
    digitalValue: 0,
    analogValue: 0,
    pwmValue: 0,
    isPwm: false,
    pwmFrequency: 490,
  }
}

function createDefaultSnapshot(): PinSnapshot[] {
  return Array.from({ length: MAX_ARDUINO_PIN + 1 }, (_, i) => createDefaultPin(i))
}

export class PinStateStore {
  // Immutable snapshot array — replaced entirely on any change so that
  // useSyncExternalStore can do reference equality without deep compare.
  private snapshot: PinSnapshot[] = createDefaultSnapshot()

  private listeners = new Set<Listener>()

  // Interrupts registered by the sketch via attachInterrupt()
  private interrupts = new Map<number, InterruptEntry>()

  // Previous digital values, for edge detection
  private prevDigital = new Array<number>(MAX_ARDUINO_PIN + 1).fill(0)

  // Optional sink for external digital writes. The active runner registers
  // this so button presses and circuit-solver outputs flow into the MCU's
  // PIN register; without it, `digitalRead()` would keep reading stale
  // values no matter how many times the UI updates the store.
  private externalPinSink: ((pin: number, digitalValue: 0 | 1) => void) | null = null

  // ── Subscription ─────────────────────────────────────────────────

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): PinStateSnapshot => this.snapshot

  /** Read a single pin (non-reactive, for VM stdlib use). */
  getPin(pin: number): PinSnapshot | null {
    if (pin < 0 || pin > MAX_ARDUINO_PIN) return null
    return this.snapshot[pin]
  }

  /** Fast path: return the digital value for a pin (used by digitalRead). */
  readDigital(pin: number): 0 | 1 {
    if (pin < 0 || pin > MAX_ARDUINO_PIN) return 0
    return this.snapshot[pin].digitalValue
  }

  /** Fast path: return the analog value for a pin (used by analogRead). */
  readAnalog(pin: number): number {
    if (pin < 0 || pin > MAX_ARDUINO_PIN) return 0
    return this.snapshot[pin].analogValue
  }

  /** Fast path: return the pin mode. */
  readMode(pin: number): PinMode {
    if (pin < 0 || pin > MAX_ARDUINO_PIN) return "UNSET"
    return this.snapshot[pin].mode
  }

  // ── Writes ───────────────────────────────────────────────────────

  /**
   * Write from sketch code (digitalWrite, analogWrite, pinMode).
   * These writes always take effect — the sketch owns its output pins.
   */
  writeFromSketch(pin: number, changes: Partial<PinSnapshot>): void {
    this.writeInternal(pin, changes, "sketch")
  }

  /**
   * Write from external source (button press, inspector, circuit solver).
   * These writes are skipped for pins that the sketch has explicitly set to OUTPUT.
   */
  writeExternal(pin: number, changes: Partial<PinSnapshot>): void {
    if (pin < 0 || pin > MAX_ARDUINO_PIN) return
    const current = this.snapshot[pin]
    // If the sketch has claimed this pin as an output, external writes are ignored.
    // (A real button wired to an OUTPUT pin would short-circuit the MCU; we just no-op.)
    if (current.mode === "OUTPUT") return
    this.writeInternal(pin, changes, "external")
    if (this.externalPinSink && changes.digitalValue !== undefined) {
      this.externalPinSink(pin, changes.digitalValue === 1 ? 1 : 0)
    }
  }

  /**
   * Register a callback that fires whenever `writeExternal` changes a pin's
   * digital value. The active runner uses this to forward UI-driven inputs
   * into the MCU's PIN register so `digitalRead()` reflects the change.
   * Pass `null` to clear.
   */
  setExternalPinSink(sink: ((pin: number, digitalValue: 0 | 1) => void) | null): void {
    this.externalPinSink = sink
  }

  /** Set pin mode only (shortcut for pinMode). */
  setPinMode(pin: number, mode: PinMode): void {
    this.writeFromSketch(pin, { mode })
  }

  private writeInternal(
    pin: number,
    changes: Partial<PinSnapshot>,
    _source: "sketch" | "external",
  ): void {
    if (pin < 0 || pin > MAX_ARDUINO_PIN) return
    const current = this.snapshot[pin]

    // Build the next pin state; bail if nothing actually changed (avoids spurious notifies)
    const next: PinSnapshot = { ...current }
    let changed = false
    if (changes.mode !== undefined && changes.mode !== current.mode) {
      next.mode = changes.mode
      changed = true
      // INPUT_PULLUP semantics: the internal pull-up resistor floats the line HIGH.
      // The sketch reads HIGH unless something pulls it LOW (e.g. a button press).
      // We seed digitalValue=1 on the mode change so digitalRead() returns 1 immediately.
      if (changes.mode === "INPUT_PULLUP" && changes.digitalValue === undefined) {
        next.digitalValue = 1
      }
      // INPUT (no pullup): floats LOW by default until something drives it.
      if (changes.mode === "INPUT" && changes.digitalValue === undefined) {
        next.digitalValue = 0
      }
    }
    if (changes.digitalValue !== undefined && changes.digitalValue !== current.digitalValue) {
      next.digitalValue = changes.digitalValue
      changed = true
    }
    if (changes.analogValue !== undefined && changes.analogValue !== current.analogValue) {
      next.analogValue = changes.analogValue
      changed = true
    }
    if (changes.pwmValue !== undefined && changes.pwmValue !== current.pwmValue) {
      next.pwmValue = changes.pwmValue
      changed = true
    }
    if (changes.isPwm !== undefined && changes.isPwm !== current.isPwm) {
      next.isPwm = changes.isPwm
      changed = true
    }
    if (changes.pwmFrequency !== undefined && changes.pwmFrequency !== current.pwmFrequency) {
      next.pwmFrequency = changes.pwmFrequency
      changed = true
    }

    if (!changed) return

    // Replace the snapshot array immutably for reference-equality change detection
    const nextArray = this.snapshot.slice()
    nextArray[pin] = next
    this.snapshot = nextArray

    // Fire interrupt edge detection if digital value changed
    if (next.digitalValue !== current.digitalValue) {
      this.checkInterrupt(pin, current.digitalValue, next.digitalValue)
    }

    this.notify()
  }

  // ── Interrupts ───────────────────────────────────────────────────

  attachInterrupt(pin: number, mode: InterruptEntry["mode"], callback: () => void): void {
    this.interrupts.set(pin, { pin, mode, callback })
  }

  detachInterrupt(pin: number): void {
    this.interrupts.delete(pin)
  }

  private checkInterrupt(pin: number, prev: number, curr: number): void {
    const entry = this.interrupts.get(pin)
    if (!entry) return
    const shouldFire =
      (entry.mode === "RISING" && prev === 0 && curr === 1) ||
      (entry.mode === "FALLING" && prev === 1 && curr === 0) ||
      (entry.mode === "CHANGE" && prev !== curr) ||
      (entry.mode === "LOW" && curr === 0)
    if (shouldFire) {
      try {
        entry.callback()
      } catch {
        // ISR errors silenced (matches real Arduino behavior — no stderr in ISR)
      }
    }
    this.prevDigital[pin] = curr
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  /** Reset all pins to defaults. Called on simulation stop/reset. */
  reset(): void {
    this.snapshot = createDefaultSnapshot()
    this.interrupts.clear()
    this.prevDigital.fill(0)
    this.notify()
  }

  /** Reset only pin values, preserving interrupt registrations.
   *  Used when the sketch is restarted but the store keeps listening. */
  resetValues(): void {
    this.snapshot = createDefaultSnapshot()
    this.prevDigital.fill(0)
    this.notify()
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }
}

// ── Singleton ──────────────────────────────────────────────────────
//
// We use a single shared store instance for the app. The VM, the React
// components, the circuit solver, and the inspector all read/write to it.
// If we ever need multi-board support, each board gets its own store instance
// and this module exports a factory instead.

export const pinStateStore = new PinStateStore()

/**
 * Get the current store state as a board-schema `PinState[]` array.
 * Used by non-React callers (circuit solver, analysis hook) that need to
 * pass pin state into APIs expecting the legacy shape.
 *
 * This is a plain read — no subscription. Callers that need reactivity
 * should use the `usePinStates()` hook instead.
 */
export function snapshotAsPinStates(store: PinStateStore = pinStateStore): PinState[] {
  return store.getSnapshot().map((s) => ({
    pin: s.pin,
    mode: s.mode,
    digitalValue: s.digitalValue,
    analogValue: s.analogValue,
    pwmValue: s.pwmValue,
    isPwm: s.isPwm,
    pwmFrequency: s.pwmFrequency,
    interruptMode: "NONE",
  }))
}

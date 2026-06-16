// ── Debug state store ───────────────────────────────────────────────────────
//
// Single source of truth for the debugger UI: the set of breakpoint lines the
// user has set, the current run/paused status, and the machine snapshot taken
// at the last halt. Mirrors the `pin-state-store` pattern — a class singleton
// with subscribe()/getSnapshot() consumed via `useSyncExternalStore` (see
// `use-debug-state.ts`). The simulation loop writes halts/status here; the
// editor gutter writes breakpoints here.

import type { DebugSnapshot } from "./runners/sketch-runner"

export type DebugStatus =
  // No debug session (sim stopped) — breakpoints persist but are inert.
  | "idle"
  // Sim running, not paused.
  | "running"
  // Halted at a breakpoint, awaiting continue/step.
  | "paused"

export type DebugStateSnapshot = {
  /** Source lines the user has set a breakpoint on (1-based). */
  breakpoints: ReadonlySet<number>
  /**
   * Subset of `breakpoints` that actually armed in the runner (the line had
   * generated code). Lines in `breakpoints` but not here are "unbound" and
   * the editor renders them dimmed.
   */
  armed: ReadonlySet<number>
  status: DebugStatus
  /** Machine state from the last halt, or null while running/idle. */
  current: DebugSnapshot | null
  /** Whether the active runner can be debugged at all (has a `debug` surface). */
  canDebug: boolean
  /** Whether the active runner has a source-line table (source vs address-only). */
  hasLineTable: boolean
}

const EMPTY_SET: ReadonlySet<number> = new Set()

export class DebugStateStore {
  private listeners = new Set<() => void>()

  private breakpoints = new Set<number>()
  private armed: ReadonlySet<number> = EMPTY_SET
  private status: DebugStatus = "idle"
  private current: DebugSnapshot | null = null
  private canDebug = false
  private hasLineTable = false

  // Cached immutable snapshot; rebuilt only on mutation so useSyncExternalStore
  // sees a stable reference between changes.
  private snapshot: DebugStateSnapshot = this.buildSnapshot()

  private buildSnapshot(): DebugStateSnapshot {
    return {
      breakpoints: new Set(this.breakpoints),
      armed: this.armed,
      status: this.status,
      current: this.current,
      canDebug: this.canDebug,
      hasLineTable: this.hasLineTable,
    }
  }

  private notify(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): DebugStateSnapshot => this.snapshot

  // ── Breakpoints (editor → store) ──────────────────────────────────────────

  /** Toggle a breakpoint on a source line. Returns the new full line set. */
  toggleBreakpoint(line: number): Set<number> {
    if (this.breakpoints.has(line)) this.breakpoints.delete(line)
    else this.breakpoints.add(line)
    this.notify()
    return new Set(this.breakpoints)
  }

  clearBreakpoints(): void {
    if (this.breakpoints.size === 0) return
    this.breakpoints.clear()
    this.armed = EMPTY_SET
    this.notify()
  }

  getBreakpointLines(): number[] {
    return [...this.breakpoints]
  }

  /** Record which breakpoint lines actually armed in the runner. */
  setArmed(lines: readonly number[]): void {
    this.armed = new Set(lines)
    this.notify()
  }

  // ── Status + halt (simulation loop → store) ───────────────────────────────

  setCapabilities(caps: { canDebug: boolean; hasLineTable: boolean }): void {
    this.canDebug = caps.canDebug
    this.hasLineTable = caps.hasLineTable
    this.notify()
  }

  setStatus(status: DebugStatus): void {
    if (this.status === status) return
    this.status = status
    if (status !== "paused") this.current = null
    this.notify()
  }

  /** Record a halt: stores the snapshot and flips status to paused. */
  setHalt(snapshot: DebugSnapshot): void {
    this.current = snapshot
    this.status = "paused"
    this.notify()
  }

  /** Clear the paused snapshot (e.g. on continue) without touching breakpoints. */
  clearHalt(): void {
    if (this.current === null && this.status !== "paused") return
    this.current = null
    this.notify()
  }

  /** Full reset to a fresh session — keeps breakpoints, drops run state. */
  reset(): void {
    this.armed = EMPTY_SET
    this.status = "idle"
    this.current = null
    this.notify()
  }
}

export const debugStateStore = new DebugStateStore()

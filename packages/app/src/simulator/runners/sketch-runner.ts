// ── SketchRunner ──────────────────────────────────────────────────────────
//
// Common interface for per-chip runners. Today only `AvrRunner` (avr8js) is
// implemented; `rp2040` and `compile-only` are declared here so the factory
// can fail with a clear message until they land.

import type { PeripheralBoardInput, PeripheralBus } from "../peripherals/peripheral-bus"
import type { PinStateStore } from "../pin-state-store"
import type { SketchSizeInfo } from "../avr-compiler"
import type { RunnerKind } from "@dreamer/schemas"

export type { RunnerKind }

/** Filename → source-code map for `#include "foo.h"` resolution. */
export type CustomLibraryMap = Record<string, string>

export type BuildLogTag = "compiler" | "upload"
export type BuildLogCallback = (tag: BuildLogTag, line: string, ts: number) => void

export type SketchRunnerCallbacks = {
  onSerialPrint: (text: string) => void
  onError: (error: string) => void
}

export type SketchRunnerLoadOptions = {
  fqbn?: string
  onLog?: BuildLogCallback
}

export type LoadResult = { success: true } | { success: false; error: string }

export type PinSnapshot = {
  digital: number
  analog: number
  pwm: number
  mode: number
}

// ── Debug-control surface ───────────────────────────────────────────────────
//
// Optional per-runner debugger. Only chip emulators with full state
// observability implement it (avr8js today); rp2040/compile-only leave
// `SketchRunner.debug` undefined and the UI disables debug controls.

/** Machine state captured at a halt (breakpoint / step / pause). */
export type DebugSnapshot = {
  /** Program counter (WORD address; same unit as the line table). */
  pc: number
  /** Source line for `pc`, or null when no line table maps it. */
  line: number | null
  /** General-purpose registers R0–R31. */
  registers: Uint8Array
  /** SRAM contents (from data-space 0x100 upward). */
  sram: Uint8Array
  /** Stack pointer. */
  sp: number
  /** Cycle count since reset. */
  cycles: number
}

export interface DebugController {
  /** True when a source-line table is available (source vs address-only). */
  readonly hasLineTable: boolean
  /**
   * Arm breakpoints by SOURCE LINE. Lines with no generated code are dropped;
   * returns the subset that actually armed so the UI can mark bound vs unbound.
   */
  setBreakpointLines(lines: readonly number[]): number[]
  /** Resume free-run after a halt (steps past the parked instruction first). */
  continue(): void
  /** Execute exactly one instruction. */
  stepInstruction(): void
  /** Run until the current source line changes (best-effort; capped). */
  stepLine(): void
  /** Whether the last run-loop iteration stopped on a breakpoint. */
  wasHalted(): boolean
  /** Capture current machine state — call right after a halt. */
  snapshot(): DebugSnapshot
}

export interface SketchRunner {
  readonly kind: RunnerKind
  readonly fqbn: string

  /**
   * Execution-control debugger, present only on runners with full state
   * observability (AVR/avr8js). Undefined ⇒ the runner can't be debugged and
   * the UI hides/disables debug controls for it.
   */
  readonly debug?: DebugController

  loadSketchAsync(
    code: string,
    customLibraries?: CustomLibraryMap,
    options?: SketchRunnerLoadOptions,
  ): Promise<{ success: boolean; error?: string }>

  /**
   * Load pre-compiled firmware directly, skipping the compile step. Only
   * runners whose chip can execute the format implement this (AVR: Intel
   * HEX). Used by the headless example-simulation suites, which run
   * committed hex fixtures without arduino-cli.
   */
  loadHex?(hex: string): void

  runSetup(): void
  runLoopIteration(): boolean

  sendSerialInput(text: string): void
  getPinState(pin: number): PinSnapshot
  getMillis(): number
  reset(): void

  // AVR runs delay() via timer cycles, so `isDelaying` is always false. The
  // hook existed for the removed transpile path — keep the method on the
  // interface so simulation-loop's tick can stay identical across runners.
  isDelaying(): boolean

  // Deprecated in favor of `kind`. Kept for a release so callers reading
  // `vm.getMode()` (e.g. serial-monitor) don't break before Step 2.
  getMode(): RunnerKind

  // Shared board surface — every runner exposes these because the peripheral
  // bus + pin store are chip-agnostic bridges to the breadboard canvas.
  getPinStore(): PinStateStore
  getPeripheralBus(): PeripheralBus
  attachBoard(input: PeripheralBoardInput): void

  // Optional: real-compile runners expose the actual sizeInfo. Others
  // return null and leave `sketchSizeRef` untouched (or use estimates).
  getSketchSize?(): SketchSizeInfo | null

  /**
   * Ratio of simulated MCU time advanced to wall-clock time elapsed, smoothed
   * as an exponential moving average across run-loop iterations. `1.0` means
   * the emulator is keeping up with real time; `< 1.0` means the MCU is lagging
   * wall-clock (a slow frame or dropped-cycle backlog). Returns `null` before
   * the first loop iteration produces a measurement. The toolbar surfaces this
   * as an unobtrusive "N× realtime" badge when the sim falls behind.
   */
  getRealtimeFactor?(): number | null

  // Optional runner-specific execution backlog metrics for tuning.
  getExecutionBacklog?(): {
    pendingSetupCycles: number
    pendingLoopCycles: number
    droppedLoopCycles: number
    maxObservedBacklogCycles: number
    /** RP2040 only: true when booted via the real bootrom, false on the
     *  synthesised fallback. Absent for runners without a bootrom concept. */
    usedBootrom?: boolean
  }
}

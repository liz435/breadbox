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

export interface SketchRunner {
  readonly kind: RunnerKind
  readonly fqbn: string

  loadSketchAsync(
    code: string,
    customLibraries?: CustomLibraryMap,
    options?: SketchRunnerLoadOptions,
  ): Promise<{ success: boolean; error?: string }>

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

  // Optional runner-specific execution backlog metrics for tuning.
  getExecutionBacklog?(): {
    pendingSetupCycles: number
    pendingLoopCycles: number
    droppedLoopCycles: number
    maxObservedBacklogCycles: number
  }
}

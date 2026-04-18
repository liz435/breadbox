// ── SketchRunner factory ──────────────────────────────────────────────────
//
// Dispatches on `BoardTargetInfo.runner` to pick the right runner
// implementation. Today only the `avr` branch is live; `rp2040` and
// `compile-only` are declared placeholders that throw with a clear message
// so future steps have an obvious plug-in point and anyone reading the
// factory can see what's coming.

import { pinStateStore, type PinStateStore } from "../pin-state-store"
import type { BoardTargetInfo } from "@dreamer/schemas"
import { createAvrSketchRunner } from "./avr-runner"
import { createRp2040SketchRunner } from "./rp2040-runner"
import { withRealCompileCheck } from "./with-real-compile-check"
import type { SketchRunner, SketchRunnerCallbacks } from "./sketch-runner"

export { createAvrSketchRunner } from "./avr-runner"
export { createRp2040SketchRunner } from "./rp2040-runner"
export { withRealCompileCheck } from "./with-real-compile-check"
export type {
  BuildLogCallback,
  BuildLogTag,
  CustomLibraryMap,
  LoadResult,
  PinSnapshot,
  RunnerKind,
  SketchRunner,
  SketchRunnerCallbacks,
  SketchRunnerLoadOptions,
} from "./sketch-runner"

export function createSketchRunner(
  target: BoardTargetInfo,
  callbacks: SketchRunnerCallbacks,
  store: PinStateStore = pinStateStore,
): SketchRunner {
  const inner = createInnerRunner(target, callbacks, store)
  return target.realCompileCheck
    ? withRealCompileCheck(inner, target, callbacks)
    : inner
}

function createInnerRunner(
  target: BoardTargetInfo,
  callbacks: SketchRunnerCallbacks,
  store: PinStateStore,
): SketchRunner {
  switch (target.runner) {
    case "avr":
      return createAvrSketchRunner(target, callbacks, store)
    case "rp2040":
      return createRp2040SketchRunner(target, callbacks, store)
    case "compile-only":
      throw new Error(
        `Runner "compile-only" is not implemented yet (board: ${target.label}). ` +
          `Add runners/compile-only-runner.ts when ESP32/STM32/SAMD support lands.`,
      )
  }
}

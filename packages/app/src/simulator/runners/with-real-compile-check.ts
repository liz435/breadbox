// ── withRealCompileCheck ──────────────────────────────────────────────────
//
// Wraps a `SketchRunner` so the real `arduino-cli` compile runs in parallel
// with the inner runner's load. Two use cases:
//
//   1. Compile-only runners (ESP32/STM32/SAMD) — the inner runner is a
//      no-op for execution but the decorator supplies the real sizeInfo
//      and compile errors that the user cares about.
//
//   2. Best-effort runners (Mega on avr8js) — the inner runner compiles
//      + runs, but the decorator can still surface compile diagnostics
//      if the inner path swallowed them. Typically unused for AVR because
//      `AvrSketchRunner` already fails load on compile errors.
//
// Races are guarded with a monotonic `loadToken`: a compile that finishes
// after the user hit Stop + started a new sketch can't scribble stale
// sizeInfo into `sketchSizeRef` or fire a stale error.

import { sketchSizeRef } from "../sketch-size-ref"
import { compileSketch } from "../avr-compiler"
import type { BoardTargetInfo } from "@dreamer/schemas"
import type {
  CustomLibraryMap,
  SketchRunner,
  SketchRunnerCallbacks,
  SketchRunnerLoadOptions,
} from "./sketch-runner"

export function withRealCompileCheck(
  inner: SketchRunner,
  target: BoardTargetInfo,
  callbacks: SketchRunnerCallbacks,
): SketchRunner {
  let loadToken = 0

  async function load(
    code: string,
    opts?: SketchRunnerLoadOptions & { customLibraries?: CustomLibraryMap },
  ): Promise<{ success: boolean; error?: string }> {
    const token = ++loadToken

    const backendLibs: Record<string, { name: string; code: string; description: string }> = {}
    if (opts?.customLibraries) {
      for (const [name, codeBody] of Object.entries(opts.customLibraries)) {
        backendLibs[name] = { name, code: codeBody, description: "" }
      }
    }

    const [innerResult, compileResult] = await Promise.all([
      inner.loadSketchAsync(code, opts?.customLibraries, opts),
      compileSketch(code, {
        fqbn: opts?.fqbn ?? target.fqbn,
        customLibraries: backendLibs,
        onLog: opts?.onLog,
      }),
    ])

    // Superseded by a newer load — drop results silently.
    if (token !== loadToken) return innerResult

    if (innerResult.success && compileResult.success && compileResult.sizeInfo) {
      sketchSizeRef.current = {
        ...compileResult.sizeInfo,
        source: "actual",
        ts: Date.now(),
      }
    }

    if (innerResult.success && !compileResult.success) {
      callbacks.onError(
        `Won't build for ${target.label}: ${compileResult.error ?? "unknown compile error"}`,
      )
    }

    return innerResult
  }

  // Forward every other method unchanged. Declared explicitly (rather than
  // via a Proxy) so TypeScript's optional-member narrowing works and stack
  // traces stay legible.
  return {
    get kind() {
      return inner.kind
    },
    get fqbn() {
      return inner.fqbn
    },
    loadSketchAsync: (code, customLibraries, options) =>
      load(code, { ...options, customLibraries }),
    runSetup: () => inner.runSetup(),
    runLoopIteration: () => inner.runLoopIteration(),
    sendSerialInput: (text) => inner.sendSerialInput(text),
    getPinState: (pin) => inner.getPinState(pin),
    getMillis: () => inner.getMillis(),
    reset: () => inner.reset(),
    isDelaying: () => inner.isDelaying(),
    getMode: () => inner.getMode(),
    getPinStore: () => inner.getPinStore(),
    getPeripheralBus: () => inner.getPeripheralBus(),
    attachBoard: (input) => inner.attachBoard(input),
    getSketchSize: inner.getSketchSize?.bind(inner),
  }
}

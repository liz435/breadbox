// ── Circuit Analysis Hook ───────────────────────────────────────────────
//
// React hook that provides circuit analysis results to the UI.
//
// Two modes:
//   1. Simulation running — reads from the simulation loop's inline analysis
//      (updated every ~12 frames inside the rAF tick). React polls for updates
//      and also re-reads whenever pin state changes (so button presses are
//      reflected without waiting for the next poll interval).
//   2. Simulation stopped — computes analysis reactively whenever components,
//      wires, OR pin state changes (button presses, manual pin overrides).

import { useMemo, useRef, useCallback, useEffect, useReducer } from "react"
import { useBoardSelector } from "@/store/board-context"
import { snapshotAsPinStates } from "./pin-state-store"
import { isBoardComponentType } from "@dreamer/schemas"
import {
  analyzeCircuit,
  hasCapacitor,
  capacitorsAreAnimating,
  type CircuitAnalysis,
} from "./circuit-solver"
import { latestSimAnalysisRef } from "./simulation-loop"
import { usePinStates } from "./use-pin-state"
import { buttonPressStore } from "./button-press-store"

const THROTTLE_MS = 200

export function useCircuitAnalysis(): {
  analysis: CircuitAnalysis | null
  isAnalyzing: boolean
} {
  // Structural deps — these always trigger a re-analysis
  const components = useBoardSelector((ctx) => ctx.components)
  const wires = useBoardSelector((ctx) => ctx.wires)

  // Subscribe to pin state. usePinStates returns an immutable PinState[]
  // (cached against the store snapshot), so the reference only changes when
  // an actual pin update happens — perfect as a re-analysis trigger.
  const pinStates = usePinStates()

  const [, forceRender] = useReducer((c: number) => c + 1, 0)
  const analysisRef = useRef<CircuitAnalysis | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRunRef = useRef(0)
  // Wall-clock timestamp of the last analysis, used to step capacitor charge.
  const lastAnalysisAtRef = useRef(0)
  // Self-rescheduling timer that animates a stopped-board cap transient until
  // it settles (then stops, so an idle cap costs nothing).
  const capAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const depsRef = useRef({ components, wires })
  depsRef.current = { components, wires }

  const hasComponents = useMemo(() => {
    return Object.values(components).some(
      (c) => !isBoardComponentType(c.type) && c.type !== "wire",
    )
  }, [components])

  // Boards with a capacitor need a higher update rate so charge/discharge
  // transients animate smoothly rather than snapping between coarse frames.
  const hasReactive = useMemo(() => hasCapacitor(components), [components])
  const pollMs = hasReactive ? 33 : THROTTLE_MS

  const runAnalysis = useCallback(() => {
    lastRunRef.current = Date.now()
    timerRef.current = null
    // Real elapsed time since the last analysis, used to advance capacitors.
    const now = performance.now()
    const dtSeconds = lastAnalysisAtRef.current
      ? Math.min((now - lastAnalysisAtRef.current) / 1000, 0.25)
      : 0
    lastAnalysisAtRef.current = now
    const { components: c, wires: w } = depsRef.current
    try {
      analysisRef.current = analyzeCircuit(c, w, snapshotAsPinStates(), undefined, { dtSeconds })
    } catch (err) {
      // Netlist construction crashed (analyzeCircuit reports solver failures
      // in-band via isValid/warnings) — keep the board interactive but leave
      // a trace instead of silently blanking the overlay.
      console.error("[circuit-analysis] analysis crashed:", err)
      analysisRef.current = null
    }
    forceRender()

    // Stopped mode only: if a capacitor is still mid-transient, keep stepping
    // it on a timer so the charge/discharge animates. It stops itself once the
    // cap settles; the next pin/structural/button change restarts it.
    if (capAnimTimerRef.current) {
      clearTimeout(capAnimTimerRef.current)
      capAnimTimerRef.current = null
    }
    if (!latestSimAnalysisRef.current?.current && capacitorsAreAnimating()) {
      capAnimTimerRef.current = setTimeout(runAnalysis, 33)
    }
  }, [])

  // When simulation is running, read from its inline analysis result
  // and re-render periodically to pick up updates
  useEffect(() => {
    if (!latestSimAnalysisRef.current) return

    const id = setInterval(() => {
      const simResult = latestSimAnalysisRef.current?.current ?? null
      if (simResult !== analysisRef.current) {
        analysisRef.current = simResult
        forceRender()
      }
    }, pollMs)

    return () => clearInterval(id)
  }, [pollMs])

  // Re-run analysis whenever components, wires, or pin state changes.
  // Pin state inclusion is critical: button presses, switch flips, and
  // manual inspector overrides all change pin values without touching
  // structural deps. Without this, the schematic and LED visuals would
  // stay frozen on the stale analysis.
  useEffect(() => {
    // If the simulation is providing fresh analysis on its own tick loop,
    // don't double-run on every pin tick — the rAF loop already handles it.
    if (latestSimAnalysisRef.current?.current) {
      // But still nudge a re-render so the UI picks up the latest sim analysis
      // without waiting for the 200ms poll.
      forceRender()
      return
    }

    if (!hasComponents) {
      if (analysisRef.current !== null) {
        analysisRef.current = null
        forceRender()
      }
      return
    }

    const elapsed = Date.now() - lastRunRef.current

    if (elapsed >= THROTTLE_MS) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      runAnalysis()
    } else if (timerRef.current === null) {
      timerRef.current = setTimeout(runAnalysis, THROTTLE_MS - elapsed)
    }
  }, [components, wires, pinStates, hasComponents, runAnalysis])

  // Re-run analysis when a button is physically pressed/released.
  // This handles pure hardware circuits (5V → button → LED → GND) where
  // no Arduino pin is involved and pinStates never changes.
  useEffect(() => {
    return buttonPressStore.subscribe(() => {
      if (latestSimAnalysisRef.current?.current) return
      if (hasComponents) runAnalysis()
    })
  }, [hasComponents, runAnalysis])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (capAnimTimerRef.current !== null) {
        clearTimeout(capAnimTimerRef.current)
        capAnimTimerRef.current = null
      }
    }
  }, [])

  return { analysis: analysisRef.current, isAnalyzing: timerRef.current !== null }
}

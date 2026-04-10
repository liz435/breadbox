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
import {
  analyzeCircuit,
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

  const depsRef = useRef({ components, wires })
  depsRef.current = { components, wires }

  const hasComponents = useMemo(() => {
    return Object.values(components).some(
      (c) => c.type !== "arduino_uno" && c.type !== "wire",
    )
  }, [components])

  const runAnalysis = useCallback(() => {
    lastRunRef.current = Date.now()
    timerRef.current = null
    const { components: c, wires: w } = depsRef.current
    try {
      analysisRef.current = analyzeCircuit(c, w, snapshotAsPinStates())
    } catch {
      analysisRef.current = null
    }
    forceRender()
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
    }, THROTTLE_MS)

    return () => clearInterval(id)
  }, [])

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
    }
  }, [])

  return { analysis: analysisRef.current, isAnalyzing: timerRef.current !== null }
}

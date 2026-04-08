// ── Circuit Analysis Hook ───────────────────────────────────────────────
//
// React hook that provides circuit analysis results to the UI.
// When the simulation is running, it reads from the simulation loop's
// inline analysis (updated every ~12 frames). When stopped, it runs
// its own analysis reactively on *structural* board changes (components
// and wires), NOT on every pin-state tick — pin states are read via a
// ref at analysis time so they're always current without causing extra
// re-analyses.

import { useMemo, useRef, useCallback, useEffect, useReducer } from "react"
import { useBoardSelector } from "@/store/board-context"
import {
  analyzeCircuit,
  type CircuitAnalysis,
} from "./circuit-solver"
import { latestSimAnalysisRef } from "./simulation-loop"

const THROTTLE_MS = 200

export function useCircuitAnalysis(): {
  analysis: CircuitAnalysis | null
  isAnalyzing: boolean
} {
  // Structural deps — only these trigger a re-analysis
  const components = useBoardSelector((ctx) => ctx.components)
  const wires = useBoardSelector((ctx) => ctx.wires)

  // Pin states read via ref at analysis time (not a re-render trigger)
  const pinStatesRef = useRef(useBoardSelector((ctx) => ctx.pinStates))
  const pinStatesLatest = useBoardSelector((ctx) => ctx.pinStates)
  pinStatesRef.current = pinStatesLatest

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
      analysisRef.current = analyzeCircuit(c, w, pinStatesRef.current)
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

  // When simulation is NOT running, compute analysis reactively on
  // structural changes (components, wires) only — NOT on pinStates.
  useEffect(() => {
    // If the simulation is providing analysis, skip our own computation
    if (latestSimAnalysisRef.current?.current) return

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
  }, [components, wires, hasComponents, runAnalysis])

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

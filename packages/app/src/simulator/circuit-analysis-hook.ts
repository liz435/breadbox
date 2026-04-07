// ── Circuit Analysis Hook ───────────────────────────────────────────────
//
// React hook that provides circuit analysis results to the UI.
// When the simulation is running, it reads from the simulation loop's
// inline analysis (updated every ~12 frames). When stopped, it runs
// its own analysis reactively on board state changes.

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
  const components = useBoardSelector((ctx) => ctx.components)
  const wires = useBoardSelector((ctx) => ctx.wires)
  const pinStates = useBoardSelector((ctx) => ctx.pinStates)

  const [, forceRender] = useReducer((c: number) => c + 1, 0)
  const analysisRef = useRef<CircuitAnalysis | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRunRef = useRef(0)

  const depsRef = useRef({ components, wires, pinStates })
  depsRef.current = { components, wires, pinStates }

  const hasComponents = useMemo(() => {
    return Object.values(components).some(
      (c) => c.type !== "arduino_uno" && c.type !== "wire",
    )
  }, [components])

  const runAnalysis = useCallback(() => {
    lastRunRef.current = Date.now()
    timerRef.current = null
    const { components: c, wires: w, pinStates: p } = depsRef.current
    try {
      analysisRef.current = analyzeCircuit(c, w, p)
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

  // When simulation is NOT running, compute analysis reactively
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
  }, [components, wires, pinStates, hasComponents, runAnalysis])

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

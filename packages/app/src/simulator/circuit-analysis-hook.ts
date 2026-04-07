// ── Circuit Analysis Hook ───────────────────────────────────────────────
//
// React hook that runs SPICE circuit analysis reactively whenever
// the board state changes. Uses throttle (not debounce) so analysis
// still runs periodically during active simulation.

import { useMemo, useRef, useState, useEffect } from "react"
import { useBoardSelector } from "@/store/board-context"
import {
  analyzeCircuit,
  type CircuitAnalysis,
} from "./circuit-solver"

/** Minimum interval between analysis runs (ms). */
const THROTTLE_MS = 200

export function useCircuitAnalysis(): {
  analysis: CircuitAnalysis | null
  isAnalyzing: boolean
} {
  const components = useBoardSelector((ctx) => ctx.components)
  const wires = useBoardSelector((ctx) => ctx.wires)
  const pinStates = useBoardSelector((ctx) => ctx.pinStates)

  const [analysis, setAnalysis] = useState<CircuitAnalysis | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRunRef = useRef(0)

  const hasComponents = useMemo(() => {
    return Object.values(components).some(
      (c) => c.type !== "arduino_uno" && c.type !== "wire",
    )
  }, [components])

  useEffect(() => {
    if (!hasComponents) {
      setAnalysis(null)
      setIsAnalyzing(false)
      return
    }

    setIsAnalyzing(true)

    const now = Date.now()
    const elapsed = now - lastRunRef.current

    function runAnalysis() {
      lastRunRef.current = Date.now()
      try {
        const result = analyzeCircuit(components, wires, pinStates)
        setAnalysis(result)
      } catch {
        setAnalysis(null)
      }
      setIsAnalyzing(false)
      timerRef.current = null
    }

    // If enough time has passed, run immediately
    if (elapsed >= THROTTLE_MS) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      runAnalysis()
    } else if (timerRef.current === null) {
      // Schedule a run after the remaining throttle window
      timerRef.current = setTimeout(runAnalysis, THROTTLE_MS - elapsed)
    }
    // If a timer is already pending, let it fire — don't reset it (throttle, not debounce)

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [components, wires, pinStates, hasComponents])

  return { analysis, isAnalyzing }
}

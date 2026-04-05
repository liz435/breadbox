// ── Circuit Analysis Hook ───────────────────────────────────────────────
//
// React hook that runs SPICE circuit analysis reactively whenever
// the board state changes, with debouncing to avoid thrashing.

import { useMemo, useRef, useState, useEffect } from "react"
import { useBoardSelector } from "@/store/board-context"
import {
  analyzeCircuit,
  type CircuitAnalysis,
} from "./circuit-solver"

const DEBOUNCE_MS = 100

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

  // Track whether there are any circuit-relevant components
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

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      try {
        const result = analyzeCircuit(components, wires, pinStates)
        setAnalysis(result)
      } catch {
        setAnalysis(null)
      }
      setIsAnalyzing(false)
      timerRef.current = null
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [components, wires, pinStates, hasComponents])

  return { analysis, isAnalyzing }
}

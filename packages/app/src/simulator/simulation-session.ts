// Per-project simulation ownership. UI modules may observe the active session,
// while the runner, analysis, and lifecycle remain owned by the project that
// created them rather than a mutable app-wide action object.

import type React from "react"
import type { CircuitAnalysis } from "./circuit-solver"
import type { SimulationActions } from "./simulation-loop"
import { PowerDomain } from "./power-domain"

export class SimulationSession {
  /** Project-owned source of solved supply truth for all runtime consumers. */
  readonly powerDomain = new PowerDomain()
  actions: SimulationActions | null = null
  analysisRef: React.RefObject<CircuitAnalysis | null> | null = null
  attach(actions: SimulationActions, analysisRef: React.RefObject<CircuitAnalysis | null>): void {
    this.actions = actions
    this.analysisRef = analysisRef
  }
  dispose(): void {
    this.actions = null
    this.analysisRef = null
    this.powerDomain.reset()
  }
}

let activeSession: SimulationSession | null = null

export function createSimulationSession(): SimulationSession {
  return new SimulationSession()
}

export function setActiveSimulationSession(session: SimulationSession | null): void {
  activeSession = session
}

export function getActiveSimulationSession(): SimulationSession | null {
  return activeSession
}

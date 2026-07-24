import type { SimulationActions } from "./simulation-loop"
import { createSimulationSession, getActiveSimulationSession } from "./simulation-session"

/** Compatibility view for legacy controls. New code should own a SimulationSession. */
const compatibilitySession = createSimulationSession()
export const simulationRef: { current: SimulationActions | null } = {
  get current() { return getActiveSimulationSession()?.actions ?? compatibilitySession.actions },
  set current(actions) { compatibilitySession.actions = actions },
}

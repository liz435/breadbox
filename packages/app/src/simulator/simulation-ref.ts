import type { SimulationActions } from "./simulation-loop"

/** Shared simulation instance — set by PlayControls, read by SketchEditor. */
export const simulationRef: { current: SimulationActions | null } = { current: null }

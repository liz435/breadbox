/**
 * Explicit SPICE model coverage policy. The netlist builder decides whether a
 * definition exists; this module records the semantic quality of that model so
 * callers never mistake a two-state/equivalent model for component physics.
 */
export type ModelCoverageClass = "supported" | "approximate" | "unsupported"

export type ModelCoverageDescription = {
  classification: ModelCoverageClass
  reason?: string
}

export const APPROXIMATE_MODEL_REASONS: Readonly<Record<string, string>> = {
  servo: "Two-state electrical equivalent; mechanical angle and torque are not solved.",
  dc_motor: "R/L armature with optional back-EMF snapshot; mechanical inertia is not solved.",
  relay: "Coil/ideal-contact approximation; contact bounce and magnetic dynamics are not solved.",
  neopixel: "Aggregate current-load model; per-pixel switching and color PWM are not solved.",
}

export function describeModelCoverage(type: string, hasNetlistModel: boolean): ModelCoverageDescription {
  if (!hasNetlistModel) {
    return {
      classification: "unsupported",
      reason: `No SPICE netlist model is registered for ${type}`,
    }
  }
  const reason = APPROXIMATE_MODEL_REASONS[type]
  return reason
    ? { classification: "approximate", reason }
    : { classification: "supported" }
}

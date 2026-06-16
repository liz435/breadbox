// ── Catalog shared helpers ────────────────────────────────────────────────
//
// Small utilities shared by the per-component definitions in catalog/<type>/.
// Kept dependency-light (schemas + grid types only) so every component folder
// can import from here without pulling in unrelated subsystems.

import { resolveComponentPins } from "@dreamer/schemas"
import type { ComponentFootprint } from "@/breadboard/breadboard-grid"

/**
 * Derive footprint points from the canonical pin resolver in @dreamer/schemas.
 * This ensures catalog footprints and the API's pin-to-grid mapping can never
 * disagree. Width and height are still specified manually since they're pixel
 * dimensions, not grid positions.
 */
export function footprintFromPins(
  type: string,
  row: number,
  col: number,
  width: number,
  height: number,
  properties?: Record<string, unknown>,
): ComponentFootprint {
  const pins = resolveComponentPins(type, row, col, properties)
  const points = Object.values(pins)
  // Deduplicate any overlapping pin points returned by the shared resolver.
  const seen = new Set<string>()
  const unique = points.filter((p) => {
    const key = `${p.row},${p.col}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { points: unique, width, height }
}

/** Sanitize a component id into a SPICE-safe element name fragment. */
export function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20)
}

/** Derive a valid C++ identifier for a Servo variable from a component name. */
export function servoVarName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "myServo"
}

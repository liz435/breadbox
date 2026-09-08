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
  const normalized = id.replace(/[^a-zA-Z0-9_]/g, "_")
  if (normalized.length <= 20) return normalized

  // SPICE element names are intentionally short, but truncation alone makes
  // distinct persisted ids collide. Keep the familiar prefix and append a
  // deterministic suffix so long ids remain both readable and unique.
  let hash = 2166136261
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const suffix = (hash >>> 0).toString(36).padStart(4, "0").slice(-4)
  return `${normalized.slice(0, 15)}_${suffix}`
}

/** Derive a valid C++ identifier for a Servo variable from a component name. */
export function servoVarName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "myServo"
}

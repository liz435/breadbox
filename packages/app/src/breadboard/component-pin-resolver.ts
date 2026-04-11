// ── Component Pin Resolver ─────────────────────────────────────────
//
// Many components have their `pins` field set to null because the agent
// (and the wiring rules) prefer to derive electrical connections from
// WIRES rather than from explicit pin assignments. To answer questions
// like "which Arduino input pin does this button read from?" we have to
// trace the wire graph.
//
// This module provides small helpers that walk the breadboard wire graph
// to find Arduino pins (D0-D19) connected to a given component, optionally
// filtered by direction (input pins only, excluding 5V/GND).

import type { BoardComponent, Wire } from "@dreamer/schemas"
import { getComponentFootprint, areConnected } from "./breadboard-grid"

/**
 * Find all Arduino digital/analog pins (0-19) connected to a component.
 * Excludes power-rail wires (negative fromCol like -1=5V, -3=GND).
 *
 * Resolution rules:
 *   1. Iterate all wires.
 *   2. Skip non-Arduino wires (fromRow !== -999).
 *   3. Skip power/ground wires (fromCol < 0 or fromCol > 19).
 *   4. Check if the wire's `to` endpoint is on the same breadboard bus
 *      as ANY of the component's footprint points.
 */
export function findArduinoPinsForComponent(
  component: BoardComponent,
  wires: Record<string, Wire>,
): number[] {
  const footprint = getComponentFootprint(
    component.type,
    component.y,
    component.x,
    component.rotation,
    component.properties,
  )
  const pins = new Set<number>()

  for (const wire of Object.values(wires)) {
    if (wire.fromRow !== -999) continue
    const arduinoPin = wire.fromCol
    if (arduinoPin < 0 || arduinoPin > 19) continue

    const wireTo = { row: wire.toRow, col: wire.toCol }
    for (const fpPoint of footprint.points) {
      if (areConnected(wireTo, fpPoint)) {
        pins.add(arduinoPin)
        break
      }
    }
  }

  return [...pins]
}

/**
 * Convenience: find the first Arduino pin wired to a component.
 * Falls back to the component's explicit `pins.a` / `pins.input` / etc.
 * if no wire-based pin is found.
 */
export function findInputPinForComponent(
  component: BoardComponent,
  wires: Record<string, Wire>,
): number | null {
  const fromWires = findArduinoPinsForComponent(component, wires)
  if (fromWires.length > 0) return fromWires[0]

  // Fallback: explicit pin assignment (legacy behavior)
  const explicit =
    component.pins.a ??
    component.pins.input ??
    component.pins.signal
  return explicit ?? null
}

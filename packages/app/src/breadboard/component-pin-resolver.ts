// ── Component Pin Resolver ─────────────────────────────────────────
//
// Many components have their `pins` field set to null because the agent
// (and the wiring rules) prefer to derive electrical connections from
// WIRES rather than from explicit pin assignments. To answer questions
// like "which Arduino input pin does this button read from?" we have to
// trace the wire graph.
//
// This module provides small helpers that walk the breadboard wire graph
// to find Arduino pins connected to a given component, optionally
// filtered by direction (input pins only, excluding 5V/GND).
//
// TODO(multi-board-resolver): every helper here ignores `wire.fromBoardId
// / toBoardId` and `component.parentId`. With a single implicit breadboard
// that is fine — every endpoint shares one coordinate space. With
// multiple surface boards in components{} the helpers will treat the
// same (row, col) on DIFFERENT boards as connected, producing wrong
// pin lookups, false-positive button signals, and incorrect "what's on
// pin N" answers. Fix in lockstep with breadboard-grid.ts (areConnected,
// resolveNets) so all consumers — netlist-builder, circuit-solver,
// power-budget, schematic-layout — switch over together.

import {
  MAX_ARDUINO_PIN,
  resolveComponentPins,
  type BoardComponent,
  type Wire,
} from "@dreamer/schemas"
import { getComponentFootprint, areConnected, resolveNets } from "./breadboard-grid"

const GROUND_PINS = new Set([-3, -4, -6])
const POWER_PINS = new Set([-1, -2])

type ButtonSideAnalysis = {
  signalPins: Set<number>
  hasGroundReference: boolean
  hasPowerReference: boolean
}

export type ButtonWiringAnalysis = {
  inputPin: number | null
  hasGroundReference: boolean
  hasPowerReference: boolean
  hasSignalOnBothSides: boolean
}

/**
 * Find all Arduino digital/analog pins (>=0) connected to a component.
 * Excludes power-rail wires (negative fromCol like -1=5V, -3=GND).
 *
 * Resolution rules:
 *   1. Iterate all wires.
 *   2. Skip non-Arduino wires (fromRow !== -999).
 *   3. Skip power/ground wires (fromCol < 0 or fromCol > MAX_ARDUINO_PIN).
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
    if (arduinoPin < 0 || arduinoPin > MAX_ARDUINO_PIN) continue

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
 * Find Arduino pins connected to one or more named component pins.
 *
 * This is stricter than `findArduinoPinsForComponent`: it only considers the
 * canonical pin position(s), so power/VCC wires on a nearby row cannot be
 * mistaken for a signal pin.
 */
export function findArduinoPinsForComponentPin(
  component: BoardComponent,
  pinNames: string | readonly string[],
  wires: Record<string, Wire>,
): number[] {
  const names = Array.isArray(pinNames) ? pinNames : [pinNames]
  const pins = new Set<number>()

  for (const name of names) {
    const explicit = component.pins?.[name]
    if (typeof explicit === "number" && explicit >= 0 && explicit <= MAX_ARDUINO_PIN) {
      pins.add(explicit)
    }
  }
  if (pins.size > 0) return [...pins].sort((a, b) => a - b)

  const pinMap = resolveComponentPins(
    component.type,
    component.y,
    component.x,
    component.properties,
  )
  const targetPoints = names
    .map((name) => pinMap[name])
    .filter(Boolean) as Array<{ row: number; col: number }>
  if (targetPoints.length === 0) return []

  for (const wire of Object.values(wires)) {
    if (wire.fromRow !== -999) continue
    const arduinoPin = wire.fromCol
    if (arduinoPin < 0 || arduinoPin > MAX_ARDUINO_PIN) continue

    const wireTo = { row: wire.toRow, col: wire.toCol }
    if (targetPoints.some((point) => {
      if (areConnected(wireTo, point)) return true
      // One-hop through a series resistor straddling the center gap.
      // Resistors bridge the left strip (cols 0–4) to the right strip (cols 5–9)
      // on the same row. If the target pin is on the right side and the signal
      // wire lands on the left side at the same row (or vice-versa), the signal
      // reaches the pin through the resistor.
      return (
        wireTo.row === point.row &&
        ((point.col >= 5 && wireTo.col >= 0 && wireTo.col <= 4) ||
         (point.col <= 4 && wireTo.col >= 5 && wireTo.col <= 9))
      )
    })) {
      pins.add(arduinoPin)
    }
  }

  return [...pins].sort((a, b) => a - b)
}

export function findArduinoPinForComponentPin(
  component: BoardComponent,
  pinNames: string | readonly string[],
  wires: Record<string, Wire>,
): number | null {
  return findArduinoPinsForComponentPin(component, pinNames, wires)[0] ?? null
}

/**
 * Inverse of `findArduinoPinsForComponent`: given an Arduino pin, return
 * every component whose footprint is wired to that pin. Used by the
 * peripheral bus and power-budget analyzer to answer "what is on pin N?".
 */
export function findPeripheralsOnPin(
  pin: number,
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
): BoardComponent[] {
  if (pin < 0 || pin > MAX_ARDUINO_PIN) return []
  const out: BoardComponent[] = []
  for (const component of Object.values(components)) {
    const pins = findArduinoPinsForComponent(component, wires)
    if (pins.includes(pin)) out.push(component)
  }
  return out
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
    component.pins.signal ??
    component.pins.data ??
    component.pins.out ??
    component.pins.positive ??
    component.pins.anode
  return explicit ?? null
}

function analyzeButtonSide(
  netIds: Set<string>,
  netById: Map<string, ReturnType<typeof resolveNets>[number]>,
): ButtonSideAnalysis {
  const signalPins = new Set<number>()
  let hasGroundReference = false
  let hasPowerReference = false

  for (const netId of netIds) {
    const net = netById.get(netId)
    if (!net) continue
    for (const pin of net.arduinoPins) {
      if (pin >= 0 && pin <= MAX_ARDUINO_PIN) signalPins.add(pin)
      if (GROUND_PINS.has(pin)) hasGroundReference = true
      if (POWER_PINS.has(pin)) hasPowerReference = true
    }
    for (const point of net.points) {
      if (point.col === -1 || point.col === 10) hasGroundReference = true
      if (point.col === -2 || point.col === 11) hasPowerReference = true
    }
  }

  return { signalPins, hasGroundReference, hasPowerReference }
}

/**
 * Strict button topology analysis.
 *
 * Valid Arduino-driven topology:
 * - exactly one button side has a signal pin (input)
 * - opposite side has a reference source (GND for pull-up workflows, or 5V/3V3 for INPUT workflows)
 */
export function analyzeButtonWiring(
  component: BoardComponent,
  wires: Record<string, Wire>,
): ButtonWiringAnalysis {
  if (component.type !== "button") {
    return {
      inputPin: null,
      hasGroundReference: false,
      hasPowerReference: false,
      hasSignalOnBothSides: false,
    }
  }

  const footprint = getComponentFootprint(
    component.type,
    component.y,
    component.x,
    component.rotation,
    component.properties,
  )
  const points = footprint.points
  const leftPins = [points[0], points[1]].filter(Boolean) as Array<{ row: number; col: number }>
  const rightPins = [points[2], points[3]].filter(Boolean) as Array<{ row: number; col: number }>

  if (leftPins.length === 0 || rightPins.length === 0) {
    return {
      inputPin: null,
      hasGroundReference: false,
      hasPowerReference: false,
      hasSignalOnBothSides: false,
    }
  }

  const nets = resolveNets({ [component.id]: component }, wires)
  const netById = new Map(nets.map((n) => [n.id, n]))

  const netIdsForPoints = (targets: Array<{ row: number; col: number }>): Set<string> => {
    const ids = new Set<string>()
    for (const net of nets) {
      if (net.points.some((p) => targets.some((t) => areConnected(p, t)))) {
        ids.add(net.id)
      }
    }
    return ids
  }

  const leftNetIds = netIdsForPoints(leftPins)
  const rightNetIds = netIdsForPoints(rightPins)
  const left = analyzeButtonSide(leftNetIds, netById)
  const right = analyzeButtonSide(rightNetIds, netById)

  const leftHasSignal = left.signalPins.size > 0
  const rightHasSignal = right.signalPins.size > 0
  const hasSignalOnBothSides = leftHasSignal && rightHasSignal

  if (hasSignalOnBothSides || (!leftHasSignal && !rightHasSignal)) {
    return {
      inputPin: null,
      hasGroundReference: false,
      hasPowerReference: false,
      hasSignalOnBothSides,
    }
  }

  const signalSide = leftHasSignal ? left : right
  const referenceSide = leftHasSignal ? right : left
  const sortedSignalPins = [...signalSide.signalPins].sort((a, b) => a - b)

  return {
    inputPin: sortedSignalPins[0] ?? null,
    hasGroundReference: referenceSide.hasGroundReference,
    hasPowerReference: referenceSide.hasPowerReference,
    hasSignalOnBothSides,
  }
}

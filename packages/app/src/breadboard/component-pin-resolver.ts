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
import {
  MAX_ARDUINO_PIN,
  resolveComponentPins,
  type BoardComponent,
  type Wire,
} from "@dreamer/schemas"
import {
  componentSurfaceBoardId,
  getComponentFootprint,
  terminalAddressKey,
  type Net,
} from "./breadboard-grid"
import { compileElectricalTopology, electricalTerminalKey } from "@/simulator/electrical-topology"

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
  const topology = compileElectricalTopology({ [component.id]: component }, wires)
  const netIds = new Set(
    topology.terminals
      .filter((terminal) => terminal.componentId === component.id && terminal.netId != null)
      .map((terminal) => terminal.netId!),
  )
  return [...new Set(
    topology.nets
      .filter((net) => netIds.has(net.id))
      .flatMap((net) => net.arduinoPins),
  )].filter((pin) => pin >= 0 && pin <= MAX_ARDUINO_PIN)
}

/**
 * Find Arduino pins connected to one or more named component pins.
 *
 * This is stricter than `findArduinoPinsForComponent`: it only considers the
 * canonical pin position(s), so power/VCC wires on a nearby row cannot be
 * mistaken for a signal pin.
 */
function findArduinoPinsForComponentPin(
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

  const topology = compileElectricalTopology({ [component.id]: component }, wires)
  const pinMap = resolveComponentPins(
    component.type,
    component.y,
    component.x,
    component.properties,
  )
  for (const name of names) {
    const netId = topology.terminalToNet.get(electricalTerminalKey(component.id, name))
    const net = topology.nets.find((candidate) => candidate.id === netId)
    for (const pin of net?.arduinoPins ?? []) {
      if (pin >= 0 && pin <= MAX_ARDUINO_PIN) pins.add(pin)
    }

    // A few legacy renderers call this helper without passing the resistor
    // component that bridges the center gap. Preserve that lookup as a
    // narrowly-scoped compatibility path, but keep it board-qualified and
    // only use it when the canonical terminal net had no Arduino pin.
    if (pins.size === 0 && pinMap[name]) {
      const target = pinMap[name]
      const boardId = component.parentId ?? "__legacy_surface_board__"
      for (const wire of Object.values(wires)) {
        if (wire.fromRow !== -999 || wire.fromCol < 0 || wire.fromCol > MAX_ARDUINO_PIN) continue
        if (wire.toBoardId && wire.toBoardId !== boardId) continue
        if (
          wire.toRow === target.row &&
          ((target.col >= 5 && wire.toCol >= 0 && wire.toCol <= 4) ||
            (target.col <= 4 && wire.toCol >= 5 && wire.toCol <= 9))
        ) {
          pins.add(wire.fromCol)
        }
      }
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
  const topology = compileElectricalTopology(components, wires)
  const out: BoardComponent[] = []
  for (const component of Object.values(components)) {
    const netIds = new Set(
      topology.terminals
        .filter((terminal) => terminal.componentId === component.id && terminal.netId != null)
        .map((terminal) => terminal.netId!),
    )
    if (topology.nets.some((net) => netIds.has(net.id) && net.arduinoPins.includes(pin))) {
      out.push(component)
    }
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
  netById: Map<string, Net>,
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
      // Rail polarity per isPositiveRailCol: every pair reads − then + left
      // to right, so −2/10 are the − rails and −1/11 the + rails.
      if (point.col === -2 || point.col === 10) hasGroundReference = true
      if (point.col === -1 || point.col === 11) hasPowerReference = true
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

  const topology = compileElectricalTopology({ [component.id]: component }, wires)
  const nets = topology.nets
  const netById = new Map(nets.map((n) => [n.id, n]))
  const footprint = getComponentFootprint(
    component.type,
    component.y,
    component.x,
    component.rotation,
    component.properties,
  )
  const boardId = componentSurfaceBoardId(component, { [component.id]: component })
  const netIdsForPoints = (points: typeof footprint.points): Set<string> => {
    const ids = new Set<string>()
    for (const point of points) {
      const addressKey = terminalAddressKey({ ...point, boardId })
      for (const net of nets) {
        if (net.points.some((candidate) => terminalAddressKey(candidate) === addressKey)) ids.add(net.id)
      }
    }
    return ids
  }
  const leftNetIds = netIdsForPoints(footprint.points.slice(0, 2))
  const rightNetIds = netIdsForPoints(footprint.points.slice(2, 4))
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

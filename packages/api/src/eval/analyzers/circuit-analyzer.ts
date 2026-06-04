// ── Circuit Analyzer ────────────────────────────────────────────────────
//
// Replays proposed ops to build a board state, then checks circuit quality:
// floating components, bus shorts, missing resistors, sketch/pin match.

import type { RunFile, CircuitAnalysis, PlacedComponent, PlacedWire } from "../types"
import { validateSketch } from "../../utils/sketch-validator"
import {
  DEFAULT_BOARD_TARGET,
  formatArduinoPin,
  isArduinoSignalPin,
  isBoardComponentType,
  type BoardState,
  type BoardTarget,
} from "@dreamer/schemas"

type SimpleComponent = {
  id: string
  type: string
  name: string
  x: number
  y: number
  pins: Record<string, number | null>
  properties: Record<string, unknown>
}

type SimpleWire = {
  id: string
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  color?: string
}

function detectBoardTarget(components: Iterable<SimpleComponent>): BoardTarget {
  for (const component of components) {
    if (component.type === "arduino_uno" || component.type === "arduino_nano" || component.type === "arduino_mega_2560") {
      return component.type as BoardTarget
    }
  }
  return DEFAULT_BOARD_TARGET
}

function wireLabel(row: number, col: number, boardTarget: BoardTarget): string {
  if (row === -999) {
    return formatArduinoPin(col, boardTarget)
  }
  return `(${row},${col})`
}

export function analyzeCircuit(run: RunFile): CircuitAnalysis {
  const ops = run.proposedOps
  if (ops.length === 0) return null

  // Replay ops to build board state
  const components = new Map<string, SimpleComponent>()
  const wires = new Map<string, SimpleWire>()
  let sketchCode = ""
  let boardTargetFromLoad: BoardTarget | null = null

  for (const op of ops) {
    switch (op.kind) {
      case "place_component": {
        const c = op.payload.component as SimpleComponent
        if (c) components.set(c.id, c)
        break
      }
      case "remove_component": {
        components.delete(op.payload.componentId as string)
        break
      }
      case "connect_wire": {
        const w = op.payload.wire as SimpleWire
        if (w) wires.set(w.id, w)
        break
      }
      case "remove_wire": {
        wires.delete(op.payload.wireId as string)
        break
      }
      case "update_sketch": {
        sketchCode = (op.payload.code as string) ?? ""
        break
      }
      case "load_board": {
        const state = op.payload.state as BoardState
        components.clear()
        wires.clear()
        for (const [id, c] of Object.entries(state.components ?? {})) {
          components.set(id, c as unknown as SimpleComponent)
        }
        for (const [id, w] of Object.entries(state.wires ?? {})) {
          wires.set(id, w as unknown as SimpleWire)
        }
        sketchCode = state.sketchCode ?? ""
        boardTargetFromLoad = (state.boardTarget ?? DEFAULT_BOARD_TARGET) as BoardTarget
        break
      }
    }
  }

  if (components.size === 0) return null

  const issues: string[] = []
  let floatingComponents = 0
  let busShorts = 0
  let missingResistors = 0
  const floatingComponentIds = new Set<string>()

  // Check floating components — no wire touches any of their footprint positions
  // or any position on the same breadboard bus (same row, same strip)
  const wireArray = [...wires.values()]
  const boardTarget = boardTargetFromLoad ?? detectBoardTarget(components.values())

  function isOnSameBus(wireRow: number, wireCol: number, compRow: number, compCol: number): boolean {
    if (wireRow !== compRow) return false
    // Same row — check if both are on the same strip
    const wireStrip = wireCol <= 4 ? "L" : wireCol <= 9 ? "R" : "X"
    const compStrip = compCol <= 4 ? "L" : compCol <= 9 ? "R" : "X"
    return wireStrip === compStrip && wireStrip !== "X"
  }

  for (const comp of components.values()) {
    if (isBoardComponentType(comp.type) || comp.type === "wire") continue

    // Build all positions this component occupies (footprint)
    const positions: Array<{ row: number; col: number }> = [{ row: comp.y, col: comp.x }]
    // LED/button: 2 rows
    if (comp.type === "led" || comp.type === "rgb_led" || comp.type === "button") {
      positions.push({ row: comp.y + 1, col: comp.x })
    }
    // Servo/pot/temp: 3 rows
    if (comp.type === "servo" || comp.type === "potentiometer" || comp.type === "temperature_sensor" || comp.type === "capacitor") {
      positions.push({ row: comp.y + 1, col: comp.x }, { row: comp.y + 2, col: comp.x })
    }
    // Seven segment: 9 rows (a..g, dp, gnd)
    if (comp.type === "seven_segment") {
      for (let i = 1; i <= 8; i++) positions.push({ row: comp.y + i, col: comp.x })
    }
    // LCD 16x2: 12 rows of pin footprint
    if (comp.type === "lcd_16x2") {
      for (let i = 1; i <= 11; i++) positions.push({ row: comp.y + i, col: comp.x })
    }
    // Resistor: spans 5 cols
    if (comp.type === "resistor") {
      positions.push({ row: comp.y, col: comp.x + 4 })
    }

    // Check if any wire touches any footprint position OR any position on the same bus
    const hasWire = wireArray.some(w =>
      positions.some(pos =>
        (w.toRow === pos.row && w.toCol === pos.col) ||
        (w.fromRow === pos.row && w.fromCol === pos.col) ||
        isOnSameBus(w.toRow, w.toCol, pos.row, pos.col) ||
        isOnSameBus(w.fromRow, w.fromCol, pos.row, pos.col)
      )
    )
    if (!hasWire) {
      floatingComponents++
      floatingComponentIds.add(comp.id)
      issues.push(`${comp.name} (${comp.type}) at (${comp.y},${comp.x}) has no wires connected`)
    }
  }

  // For resistors, require at least one direct endpoint wire on a lead.
  // Same-row bus adjacency alone can mask an actually unconnected part.
  for (const comp of components.values()) {
    if (comp.type !== "resistor") continue
    const leadA = { row: comp.y, col: comp.x }
    // Resistor footprint in Breadbox spans cols 3→6 (delta=3), not 3→7.
    const leadB = { row: comp.y, col: comp.x + 3 }
    const hasDirectLeadWire = wireArray.some((w) =>
      (w.toRow === leadA.row && w.toCol === leadA.col) ||
      (w.fromRow !== -999 && w.fromRow === leadA.row && w.fromCol === leadA.col) ||
      (w.toRow === leadB.row && w.toCol === leadB.col) ||
      (w.fromRow !== -999 && w.fromRow === leadB.row && w.fromCol === leadB.col)
    )
    if (!hasDirectLeadWire && !floatingComponentIds.has(comp.id)) {
      floatingComponents++
      floatingComponentIds.add(comp.id)
      issues.push(`${comp.name} (resistor) has no direct wire on either lead`)
    }
  }

  // Check bus shorts — multiple Arduino pin wires landing on same row & same strip
  const rowStripPins = new Map<string, number[]>() // "row:strip" → [arduino pins]
  for (const w of wireArray) {
    if (w.fromRow === -999) {
      // Skip wires landing on power/ground rails (col < 0 or col > 9) — those
      // are not part of the main breadboard left/right strips.
      if (w.toCol < 0 || w.toCol > 9) continue
      const strip = w.toCol <= 4 ? "L" : "R"
      const key = `${w.toRow}:${strip}`
      if (!rowStripPins.has(key)) rowStripPins.set(key, [])
      rowStripPins.get(key)!.push(w.fromCol)
    }
  }
  for (const [key, pins] of rowStripPins) {
    if (pins.length > 1) {
      // Check if they're different signal types (not just two GND wires)
      const unique = new Set(pins)
      if (unique.size > 1) {
        const hasSignal = pins.some((p) => isArduinoSignalPin(p))
        const hasPower = pins.some(p => p === -1 || p === -2)
        const hasGround = pins.some(p => p === -3 || p === -4 || p === -6)
        if ((hasSignal && hasPower) || (hasSignal && hasGround) || (hasPower && hasGround)) {
          busShorts++
          const [row, strip] = key.split(":")
          issues.push(`Bus short on row ${row} ${strip === "L" ? "left" : "right"} strip: pins ${pins.join(", ")} are on the same bus`)
        }
      }
    }
  }

  // Check LEDs without resistors in their wiring path
  const leds = [...components.values()].filter(c => c.type === "led" || c.type === "rgb_led")
  const resistors = [...components.values()].filter(c => c.type === "resistor")
  for (const led of leds) {
    // Check if any resistor shares a row with the LED (cathode row = led.y + 1)
    const cathodeRow = led.y + 1
    const hasResistorInPath = resistors.some(r => r.y === cathodeRow)
    if (!hasResistorInPath) {
      missingResistors++
      issues.push(`${led.name} has no resistor in its circuit path (cathode row ${cathodeRow})`)
    }
  }

  // Check sketch pin match
  let sketchPinMatch = true
  if (sketchCode) {
    const pinModeMatches = [...sketchCode.matchAll(/pinMode\s*\(\s*(\d+)/g)]
    const sketchPins = new Set(pinModeMatches.map(m => parseInt(m[1], 10)))
    const wiredPins = new Set(wireArray.filter(w => w.fromRow === -999 && w.fromCol >= 0).map(w => w.fromCol))

    for (const sp of sketchPins) {
      if (!wiredPins.has(sp) && sp !== 13) { // pin 13 has built-in LED
        sketchPinMatch = false
        issues.push(`Sketch uses pin ${sp} but no wire connects to it`)
      }
    }
  }

  // Validate sketch structure (balanced braces, setup/loop present).
  // Full syntax/semantic checks happen when arduino-cli compiles; this
  // is a fast fail-check used during agent evals.
  let sketchCompiles = true
  if (sketchCode.trim()) {
    const check = validateSketch(sketchCode)
    if (!check.valid) {
      sketchCompiles = false
      const loc = check.line !== undefined ? ` (line ${check.line})` : ""
      issues.push(`Sketch validation: ${check.error ?? "unknown"}${loc}`)
    }
  } else if (components.size > 0) {
    issues.push("No sketch code generated despite placing components")
    sketchCompiles = false
  }

  // Build full output for the eval
  const placedComponents: PlacedComponent[] = [...components.values()].map(c => ({
    id: c.id,
    type: c.type,
    name: c.name,
    x: c.x,
    y: c.y,
    pins: c.pins,
    properties: c.properties,
  }))

  const placedWires: PlacedWire[] = wireArray.map(w => ({
    id: w.id,
    fromRow: w.fromRow,
    fromCol: w.fromCol,
    toRow: w.toRow,
    toCol: w.toCol,
    color: w.color ?? "#22c55e",
    fromLabel: wireLabel(w.fromRow, w.fromCol, boardTarget),
    toLabel: wireLabel(w.toRow, w.toCol, boardTarget),
  }))

  return {
    componentsPlaced: components.size,
    wiresCreated: wires.size,
    floatingComponents,
    busShorts,
    missingResistors,
    sketchPinMatch,
    sketchCompiles,
    issues,
    components: placedComponents,
    wires: placedWires,
    sketch: sketchCode,
  }
}

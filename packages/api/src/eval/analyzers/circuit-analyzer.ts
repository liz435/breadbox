// ── Circuit Analyzer ────────────────────────────────────────────────────
//
// Replays proposed ops to build a board state, then checks circuit quality:
// floating components, bus shorts, missing resistors, sketch/pin match.

import type { RunFile, CircuitAnalysis, PlacedComponent, PlacedWire } from "../types"
import { transpile } from "../../../../app/src/simulator/arduino-transpiler"

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

function wireLabel(row: number, col: number): string {
  if (row === -999) {
    if (col === -1) return "5V"
    if (col === -2) return "3.3V"
    if (col === -3 || col === -4 || col === -6) return "GND"
    if (col >= 14) return `A${col - 14}`
    if (col >= 0) return `D${col}`
    return `pin ${col}`
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
    }
  }

  if (components.size === 0) return null

  const issues: string[] = []
  let floatingComponents = 0
  let busShorts = 0
  let missingResistors = 0

  // Check floating components — no wire touches any of their footprint positions
  // or any position on the same breadboard bus (same row, same strip)
  const wireArray = [...wires.values()]

  function isOnSameBus(wireRow: number, wireCol: number, compRow: number, compCol: number): boolean {
    if (wireRow !== compRow) return false
    // Same row — check if both are on the same strip
    const wireStrip = wireCol <= 4 ? "L" : wireCol <= 9 ? "R" : "X"
    const compStrip = compCol <= 4 ? "L" : compCol <= 9 ? "R" : "X"
    return wireStrip === compStrip && wireStrip !== "X"
  }

  for (const comp of components.values()) {
    if (comp.type === "arduino_uno" || comp.type === "wire") continue

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
      issues.push(`${comp.name} (${comp.type}) at (${comp.y},${comp.x}) has no wires connected`)
    }
  }

  // Check bus shorts — multiple Arduino pin wires landing on same row & same strip
  const rowStripPins = new Map<string, number[]>() // "row:strip" → [arduino pins]
  for (const w of wireArray) {
    if (w.fromRow === -999) {
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
        const hasSignal = pins.some(p => p >= 0 && p <= 19)
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

  // Validate sketch through transpiler
  let sketchCompiles = true
  if (sketchCode.trim()) {
    const transpileResult = transpile(sketchCode)
    if (!transpileResult.success) {
      sketchCompiles = false
      const err = transpileResult.error
      issues.push(`Sketch transpile error: ${err?.message ?? "unknown"} (line ${err?.line ?? "?"})`)
    } else {
      // Try JS compilation
      try {
        new Function(transpileResult.code)
      } catch (e) {
        sketchCompiles = false
        issues.push(`Sketch JS error: ${e instanceof Error ? e.message : "unknown"}`)
      }
    }

    // Check for missing setup/loop
    if (!/\bvoid\s+setup\s*\(/.test(sketchCode)) {
      issues.push("Sketch missing setup() function")
    }
    if (!/\bvoid\s+loop\s*\(/.test(sketchCode)) {
      issues.push("Sketch missing loop() function")
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
    fromLabel: wireLabel(w.fromRow, w.fromCol),
    toLabel: wireLabel(w.toRow, w.toCol),
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

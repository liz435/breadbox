// ── Component Registry ────────────────────────────────────────────────────
//
// The single source of truth for all component types.
//
// IMPORTANT: Pin-to-grid-position mapping lives in @dreamer/schemas/component-pins.ts
// (resolveComponentPins). The registry footprint functions should use
// footprintFromPins() where possible so the API (propose_circuit, power-budget-
// analyzer) and the frontend always agree on pin positions. Components that
// have physical footprint points beyond their electrical pins (e.g., button
// spans 4 holes but has 2 electrical nodes) should document the mapping.
//
// To add a new component:
//   1. Add its type to componentTypeSchema in packages/schemas/src/arduino.ts
//   2. Add pin mapping in packages/schemas/src/component-pins.ts
//   3. Add a ComponentDefinition entry to COMPONENT_REGISTRY below
//   4. Optionally create a custom renderer in component-renderers/ and/or
//      a custom inspector in panels/inspector.tsx

import type React from "react"
import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import { buttonPressStore } from "@/simulator/button-press-store"
import { getCapVoltage } from "@/simulator/capacitor-state"
import { diodeModelLine, getLedDiodeModel, getRgbLedDiodeModel } from "@/simulator/diode-model"
import { resolveComponentPins } from "@dreamer/schemas"
import type { ComponentDefinition } from "./component-definition"
import type { ComponentFootprint } from "@/breadboard/breadboard-grid"

// ── Icons ─────────────────────────────────────────────────────────────────

// Inline SVG icons so this file has no React component deps
function icon(content: React.ReactNode): React.ReactNode {
  return content
}

// ── Footprint helper ─────────────────────────────────────────────────────
//
// Derives footprint points from the canonical pin resolver in @dreamer/schemas.
// This ensures registry footprints and the API's pin-to-grid mapping can never
// disagree. Width and height are still specified manually since they're pixel
// dimensions, not grid positions.

function footprintFromPins(
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

// ── Registry ──────────────────────────────────────────────────────────────

export const COMPONENT_REGISTRY: ComponentDefinition[] = [
  // ── LED ──────────────────────────────────────────────────────────────
  {
    type: "led",
    label: "LED",
    category: "output",
    description: "Light-emitting diode — lights up when current flows through it",
    defaultPins: { anode: null, cathode: null },
    defaultProperties: { color: "#ef4444" },
    accentColor: "#ef4444",
    footprint: (row, col) => footprintFromPins("led", row, col, HOLE_SPACING, HOLE_SPACING * 2),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <ellipse cx={12} cy={10} rx={6} ry={7} fill="#ef4444" opacity={0.9} />
        <line x1={10} y1={17} x2={10} y2={21} stroke="#ccc" strokeWidth={1.5} />
        <line x1={14} y1={17} x2={14} y2={21} stroke="#ccc" strokeWidth={1.5} />
      </svg>
    ),
    spicePrefix: "D",
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const pinPoints = resolveComponentPins("led", comp.y, comp.x, comp.properties)
      const anodePoint = pinPoints.anode ?? footprint.points[0]
      const cathodePoint = pinPoints.cathode ?? footprint.points[1]
      const nodeA = resolveNode(anodePoint)
      const nodeB = resolveNode(cathodePoint)
      const model = getLedDiodeModel(comp.properties.color as string | undefined)
      return {
        lines: [`D_${sanitize(comp.id)} ${nodeA} ${nodeB} ${model.name}`],
        modelLines: [diodeModelLine(model)],
        nodeA,
        nodeB,
      }
    },
    computeElectricalState: (comp, { voltageDrop, currentMa }) => {
      const isReversed = voltageDrop < -0.1
      const isActive = Math.abs(currentMa) > 0.5 && voltageDrop > 0.1
      const brightness = isActive ? Math.min(1, Math.max(0, currentMa / 20)) : 0
      const warnings: NonNullable<import("./component-definition").ElectricalOutput["warnings"]> = []
      if (isReversed) warnings.push({ type: "reverse_polarity", message: `${comp.name} has reversed polarity` })
      if (isActive && currentMa > 30) warnings.push({ type: "no_resistor", message: `${comp.name} has excessive current (${currentMa.toFixed(1)}mA). Add a series resistor.` })
      return { isActive, voltage: voltageDrop, current: currentMa, isReversed, brightness, warnings, emitCurrentPath: isActive }
    },
    generateSketch: (comp) => {
      const pin = comp.pins.anode ?? comp.pins.cathode
      if (pin == null) return null
      return {
        setupLines: [`  pinMode(${pin}, OUTPUT); // ${comp.name}`],
        loopLines: [`  digitalWrite(${pin}, HIGH); // ${comp.name}`],
        hasPin: true,
      }
    },
    schematicSymbol: "led",
    schematicValue: (comp) => {
      const color = comp.properties.color as string | undefined
      return color ? `${color} LED` : "LED"
    },
  },

  // ── RGB LED ───────────────────────────────────────────────────────────
  {
    type: "rgb_led",
    category: "output",
    description: "Red/green/blue LED — mix colors with PWM",
    label: "RGB LED",
    defaultPins: { red: null, green: null, blue: null, common: null },
    accentColor: "#a855f7",
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row: row + 1, col },
        { row: row + 2, col },
        { row: row + 3, col },
      ],
      width: HOLE_SPACING,
      height: HOLE_SPACING * 4,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <ellipse cx={12} cy={10} rx={6} ry={7} fill="url(#rgb)" opacity={0.9} />
        <defs>
          <linearGradient id="rgb" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        <line x1={10} y1={17} x2={10} y2={21} stroke="#ccc" strokeWidth={1.5} />
        <line x1={14} y1={17} x2={14} y2={21} stroke="#ccc" strokeWidth={1.5} />
      </svg>
    ),
    spicePrefix: "D",
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const pinPoints = resolveComponentPins("rgb_led", comp.y, comp.x, comp.properties)
      const channelPoint = pinPoints.red ?? footprint.points[0]
      const commonPoint = pinPoints.common ?? footprint.points[3] ?? footprint.points[1] ?? footprint.points[0]
      const nodeA = resolveNode(channelPoint)
      const nodeB = resolveNode(commonPoint)
      const model = getRgbLedDiodeModel()
      return {
        lines: [`D_${sanitize(comp.id)} ${nodeA} ${nodeB} ${model.name}`],
        modelLines: [diodeModelLine(model)],
        nodeA,
        nodeB,
      }
    },
    computeElectricalState: (comp, { voltageDrop, currentMa }) => {
      const isReversed = voltageDrop < -0.1
      const isActive = Math.abs(currentMa) > 0.5 && voltageDrop > 0.1
      const brightness = isActive ? Math.min(1, Math.max(0, currentMa / 20)) : 0
      const warnings: NonNullable<import("./component-definition").ElectricalOutput["warnings"]> = []
      if (isReversed) warnings.push({ type: "reverse_polarity", message: `${comp.name} has reversed polarity` })
      if (isActive && currentMa > 30) warnings.push({ type: "no_resistor", message: `${comp.name} has excessive current (${currentMa.toFixed(1)}mA). Add a series resistor.` })
      return { isActive, voltage: voltageDrop, current: currentMa, isReversed, brightness, warnings, emitCurrentPath: isActive }
    },
    generateSketch: (comp) => {
      const setupLines: string[] = []
      const loopLines: string[] = []
      let hasPin = false
      for (const [label, pin] of Object.entries(comp.pins)) {
        if (pin != null && label !== "cathode" && label !== "common") {
          hasPin = true
          setupLines.push(`  pinMode(${pin}, OUTPUT); // ${comp.name} ${label}`)
          loopLines.push(`  analogWrite(${pin}, 128); // ${comp.name} ${label}`)
        }
      }
      return hasPin ? { setupLines, loopLines, hasPin } : null
    },
    schematicSymbol: "led",
    schematicValue: () => "RGB LED",
  },

  // ── Resistor ──────────────────────────────────────────────────────────
  {
    type: "resistor",
    category: "passive",
    description: "Limits current flow — essential for protecting LEDs",
    label: "Resistor",
    defaultPins: { a: null, b: null },
    defaultProperties: { resistance: 220 },
    accentColor: "#d2b48c",
    // Horizontal resistor that STRADDLES the center gap: one leg in the left
    // half (col 3), the other in the right half (col 6). This matches how
    // resistors are placed on a real breadboard and keeps the two legs in
    // separate nets. The stored `x` (col) is ignored for pin placement — the
    // `row` decides which row of 5 each leg lives in.
    footprint: (row, col) => footprintFromPins("resistor", row, col, HOLE_SPACING * 5, HOLE_SPACING),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={3} y={9} width={18} height={6} rx={2} fill="#d2b48c" stroke="#a0825a" strokeWidth={1} />
        <line x1={3} y1={12} x2={1} y2={12} stroke="#ccc" strokeWidth={1.5} />
        <line x1={21} y1={12} x2={23} y2={12} stroke="#ccc" strokeWidth={1.5} />
      </svg>
    ),
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const nodeA = resolveNode(footprint.points[0])
      const nodeB = resolveNode(footprint.points[1])
      const resistance = (comp.properties.resistance as number) ?? 220
      return { lines: [`R_${sanitize(comp.id)} ${nodeA} ${nodeB} ${resistance}`], nodeA, nodeB }
    },
    computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
      isActive: currentMa > 0.01,
      voltage: voltageDrop,
      current: currentMa,
      isReversed: false,
      brightness: 0,
      emitCurrentPath: currentMa > 0.01,
    }),
    generateSketch: () => null, // passive — no sketch code
    schematicSymbol: "resistor",
    schematicValue: (comp) => {
      const ohms = comp.properties.resistance as number | undefined
      if (ohms == null) return undefined
      if (ohms >= 1_000_000) return `${(ohms / 1_000_000).toFixed(1)}MΩ`
      if (ohms >= 1_000) return `${(ohms / 1_000).toFixed(1)}kΩ`
      return `${ohms}Ω`
    },
  },

  // ── Capacitor ─────────────────────────────────────────────────────────
  {
    type: "capacitor",
    category: "passive",
    description: "Stores and releases electrical charge",
    label: "Capacitor",
    defaultPins: { a: null, b: null },
    defaultProperties: { capacitance: 100 },
    accentColor: "#3b82f6",
    footprint: (row, col) => footprintFromPins("capacitor", row, col, HOLE_SPACING, HOLE_SPACING * 3),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <line x1={12} y1={2} x2={12} y2={8} stroke="#ccc" strokeWidth={1.5} />
        <line x1={4} y1={8} x2={20} y2={8} stroke="#3b82f6" strokeWidth={2.5} />
        <line x1={4} y1={12} x2={20} y2={12} stroke="#3b82f6" strokeWidth={2.5} />
        <line x1={12} y1={12} x2={12} y2={22} stroke="#ccc" strokeWidth={1.5} />
      </svg>
    ),
    spicePrefix: "V",
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const nodeA = resolveNode(footprint.points[0])
      const nodeB = resolveNode(footprint.points[1])
      // Model the capacitor as a voltage source at its current charge level.
      // The circuit solver steps the voltage forward each frame using the
      // resulting SPICE current (see capacitor-state.ts).
      const storedV = getCapVoltage(comp.id)
      return {
        lines: [`V_${sanitize(comp.id)} ${nodeA} ${nodeB} ${storedV}`],
        nodeA,
        nodeB,
      }
    },
    computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
      isActive: Math.abs(currentMa) > 0.01,
      voltage: voltageDrop,
      current: currentMa,
      isReversed: false,
      brightness: 0,
      emitCurrentPath: Math.abs(currentMa) > 0.01,
    }),
    generateSketch: () => null, // passive — no sketch code
    schematicSymbol: "capacitor",
    schematicValue: (comp) => {
      const cap = comp.properties.capacitance as number | undefined
      return cap != null ? `${cap}µF` : undefined
    },
  },

  // ── Button ────────────────────────────────────────────────────────────
  {
    type: "button",
    category: "input",
    description: "Momentary push button — closes circuit when pressed",
    label: "Push Button",
    defaultPins: { a: null, b: null },
    accentColor: "#f59e0b",
    // Button has 4 physical footprint points (2 rows x 2 sides) but only 2
    // electrical nodes. resolveComponentPins returns the wire-targeting points
    // (row,3) and (row,6); this footprint includes all 4 physical holes for
    // rendering and bus connectivity. If pin positions change in component-pins.ts,
    // update the cols here to match.
    footprint: (row) => ({
      points: [
        { row, col: 3 },
        { row: row + 1, col: 3 },
        { row, col: 6 },
        { row: row + 1, col: 6 },
      ],
      width: 60,
      height: HOLE_SPACING * 2,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={4} y={8} width={16} height={8} rx={2} fill="#374151" stroke="#f59e0b" strokeWidth={1.5} />
        <circle cx={12} cy={12} r={3} fill="#f59e0b" />
      </svg>
    ),
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const leftNode = resolveNode(footprint.points[0])
      const rightNode = resolveNode(footprint.points[2])
      // Strict button model: only physical press changes contact resistance.
      // Do not infer press state from pin values, which can create feedback loops.
      const isPressed = buttonPressStore.isPressed(comp.id)
      const resistance = isPressed ? 0.01 : 10_000_000
      return { lines: [`R_${sanitize(comp.id)} ${leftNode} ${rightNode} ${resistance}`], nodeA: leftNode, nodeB: rightNode }
    },
    computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
      isActive: currentMa > 0.01,
      voltage: voltageDrop,
      current: currentMa,
      isReversed: false,
      brightness: 0,
    }),
    generateSketch: (comp) => {
      const pin = comp.pins.a ?? comp.pins.b
      if (pin == null) return null
      return {
        setupLines: [`  pinMode(${pin}, INPUT_PULLUP); // ${comp.name}`],
        hasPin: true,
      }
    },
    schematicSymbol: "button",
    schematicValue: () => undefined,
  },

  // ── Potentiometer ─────────────────────────────────────────────────────
  {
    type: "potentiometer",
    category: "input",
    description: "Variable resistor — turn the knob to change analog value",
    label: "Potentiometer",
    defaultPins: { vcc: null, signal: null, gnd: null },
    accentColor: "#78716c",
    footprint: (row, col) => ({
      points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }],
      width: HOLE_SPACING,
      height: HOLE_SPACING * 3,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <circle cx={12} cy={12} r={8} fill="#78716c" stroke="#57534e" strokeWidth={1} />
        <line x1={12} y1={12} x2={12} y2={5} stroke="#fbbf24" strokeWidth={2} strokeLinecap="round" />
        <circle cx={12} cy={12} r={2} fill="#fbbf24" />
      </svg>
    ),
    buildNetlist: (comp, { footprint, resolveNode }) => {
      if (footprint.points.length < 3) return null
      const n1 = resolveNode(footprint.points[0])
      const n2 = resolveNode(footprint.points[1])
      const n3 = resolveNode(footprint.points[2])
      const totalR = 10_000
      // Clamp the ratio away from 0 and 1 — a 0Ω element in the divider
      // (e.g. wiper at an end stop) collapses a node in the conductance
      // matrix and makes spicey throw "Singular matrix". 0.5Ω is electrically
      // indistinguishable from the end stop at the pot's precision.
      const rawRatio = ((comp.properties.value as number) ?? 50) / 100
      const ratio = Math.max(0.00005, Math.min(0.99995, rawRatio))
      return {
        lines: [
          `R_${sanitize(comp.id)}_A ${n1} ${n2} ${totalR * ratio}`,
          `R_${sanitize(comp.id)}_B ${n2} ${n3} ${totalR * (1 - ratio)}`,
        ],
        nodeA: n1,
        nodeB: n3,
      }
    },
    computeElectricalState: (comp, { voltageDrop }) => {
      // The wiper voltage is a fraction of the total voltage across the pot.
      // voltageDrop = V(vcc) - V(gnd). Wiper sits at ratio × voltageDrop.
      const ratio = ((comp.properties.value as number) ?? 50) / 100
      const wiperVoltage = Math.abs(voltageDrop) * ratio
      return {
        isActive: Math.abs(voltageDrop) > 0.01,
        voltage: wiperVoltage,
        current: 0,
        isReversed: false,
        brightness: 0,
      }
    },
    generateSketch: (comp) => {
      const pin = comp.pins.signal
      if (pin == null) return null
      return {
        setupLines: [`  // ${comp.name} on analog pin A${(pin as number) - 14}`],
        loopLines: [
          `  int ${sanitize(comp.name)}Val = analogRead(${pin}); // ${comp.name}`,
        ],
        hasPin: true,
      }
    },
    schematicSymbol: "potentiometer",
    schematicValue: () => "10kΩ pot",
  },

  // ── Buzzer ────────────────────────────────────────────────────────────
  {
    type: "buzzer",
    category: "output",
    description: "Piezo buzzer — generates tones with tone()",
    label: "Buzzer",
    defaultPins: { positive: null, negative: null },
    accentColor: "#1a1a1a",
    // Vertical layout: positive on top row, negative on row below.
    // Keeps the two legs in separate nets on the breadboard.
    footprint: (row, col) => ({
      points: [{ row, col }, { row: row + 1, col }],
      width: HOLE_SPACING * 2,
      height: HOLE_SPACING * 2,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <circle cx={12} cy={12} r={8} fill="#1f2937" stroke="#374151" strokeWidth={1} />
        <circle cx={12} cy={12} r={4} fill="#374151" stroke="#4b5563" strokeWidth={0.5} />
        <circle cx={12} cy={12} r={1.5} fill="#4b5563" />
      </svg>
    ),
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const nodeA = resolveNode(footprint.points[0])
      const nodeB = resolveNode(footprint.points[1] ?? footprint.points[0])
      return { lines: [`R_${sanitize(comp.id)} ${nodeA} ${nodeB} 30`], nodeA, nodeB }
    },
    computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
      isActive: currentMa > 0.5,
      voltage: voltageDrop,
      current: currentMa,
      isReversed: voltageDrop < -0.1,
      brightness: currentMa > 0.5 ? Math.min(1, currentMa / 50) : 0,
    }),
    generateSketch: (comp) => {
      const pin = comp.pins.positive
      if (pin == null) return null
      return {
        setupLines: [`  pinMode(${pin}, OUTPUT); // ${comp.name}`],
        hasPin: true,
      }
    },
    schematicSymbol: "buzzer",
    schematicValue: () => "Buzzer",
  },

  // ── Servo ─────────────────────────────────────────────────────────────
  {
    type: "servo",
    category: "output",
    description: "Servo motor — rotate to a precise angle (0-180°)",
    label: "Servo Motor",
    defaultPins: { signal: null, vcc: null, gnd: null },
    defaultProperties: { angle: 90 },
    accentColor: "#22c55e",
    footprint: (row, col) => ({
      points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }],
      width: HOLE_SPACING,
      height: HOLE_SPACING * 3,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={3} y={6} width={18} height={12} rx={2} fill="#166534" stroke="#22c55e" strokeWidth={1} />
        <circle cx={12} cy={12} r={3} fill="#22c55e" />
        <line x1={12} y1={12} x2={12} y2={7} stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    ),
    // Visual only — not in SPICE
    buildNetlist: () => null,
    generateSketch: (comp) => {
      const pin = comp.pins.signal
      if (pin == null) return null
      return {
        globalLines: [`Servo ${servoVarName(comp.name)};`],
        setupLines: [
          `  ${servoVarName(comp.name)}.attach(${pin}); // ${comp.name}`,
          `  ${servoVarName(comp.name)}.write(90); // ${comp.name}`,
        ],
        hasPin: true,
      }
    },
    schematicSymbol: "servo",
    schematicValue: () => "Servo",
  },

  // ── Photoresistor ─────────────────────────────────────────────────────
  {
    type: "photoresistor",
    category: "input",
    description: "Light-dependent resistor — resistance changes with light",
    label: "Photoresistor",
    defaultPins: { a: null, b: null },
    footprint: (row, col) => ({
      points: [{ row, col }, { row: row + 1, col }],
      width: HOLE_SPACING,
      height: HOLE_SPACING * 2,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={3} y={9} width={18} height={6} rx={2} fill="#d2b48c" stroke="#a0825a" strokeWidth={1} />
        <line x1={8} y1={4} x2={10} y2={7} stroke="#fbbf24" strokeWidth={1.5} />
        <line x1={12} y1={3} x2={12} y2={6} stroke="#fbbf24" strokeWidth={1.5} />
        <line x1={16} y1={4} x2={14} y2={7} stroke="#fbbf24" strokeWidth={1.5} />
      </svg>
    ),
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const nodeA = resolveNode(footprint.points[0])
      const nodeB = resolveNode(footprint.points[1] ?? footprint.points[0])
      return { lines: [`R_${sanitize(comp.id)} ${nodeA} ${nodeB} 10000`], nodeA, nodeB }
    },
    computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
      isActive: currentMa > 0.01,
      voltage: voltageDrop,
      current: currentMa,
      isReversed: false,
      brightness: 0,
    }),
    generateSketch: (comp) => {
      const pin = comp.pins.a ?? comp.pins.b
      if (pin == null) return null
      return { setupLines: [`  // ${comp.name} on analog pin ${pin}`], hasPin: true }
    },
    schematicSymbol: "photoresistor",
    schematicValue: () => "LDR",
  },

  // ── Temperature Sensor ────────────────────────────────────────────────
  {
    type: "temperature_sensor",
    category: "input",
    description: "Analog temperature sensor (TMP36)",
    label: "Temperature Sensor",
    defaultPins: { vcc: null, signal: null, gnd: null },
    defaultProperties: { temperature: 25 },
    footprint: (row, col) => ({
      points: [{ row, col }, { row: row + 1, col }, { row: row + 2, col }],
      width: HOLE_SPACING,
      height: HOLE_SPACING * 3,
    }),
    paletteIcon: (
      // TO-92 package: flat face toward viewer, three leads below
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <defs>
          <radialGradient id="tmp-pal" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#3d3d3d" />
            <stop offset="60%" stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#000" />
          </radialGradient>
        </defs>
        {/* TO-92 body: flat bottom, rounded top */}
        <path d="M6 18 L6 11 A6 6 0 0 1 18 11 L18 18 Z"
          fill="url(#tmp-pal)" stroke="#555" strokeWidth={0.7} />
        {/* Flat face — slight lighter tint */}
        <rect x={6} y={11} width={12} height={7} fill="#2a2a2a" opacity={0.4} />
        {/* Silkscreen TMP36 text on flat face */}
        <text x={12} y={15.5} textAnchor="middle" fontSize={3.2}
          fill="#b0b0b0" fontFamily="monospace" fontWeight="bold">TMP36</text>
        {/* Three leads */}
        <line x1={9}  y1={18} x2={9}  y2={23} stroke="#b0b0b0" strokeWidth={1} />
        <line x1={12} y1={18} x2={12} y2={23} stroke="#b0b0b0" strokeWidth={1} />
        <line x1={15} y1={18} x2={15} y2={23} stroke="#b0b0b0" strokeWidth={1} />
        {/* Highlight bevel on top */}
        <path d="M6 11 A6 6 0 0 1 18 11" fill="none" stroke="#505050" strokeWidth={0.5} />
      </svg>
    ),
    // TMP36: 3-pin analog sensor (VCC, Signal, GND).
    // Model as 10kΩ input impedance per pin.
    spicePrefix: "R",
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const pinNames = ["vcc", "signal", "gnd"]
      const lines: string[] = []
      let nodeA = "0"
      let nodeB = "0"
      for (let i = 0; i < 3; i++) {
        const node = resolveNode(footprint.points[i])
        if (i === 0) nodeA = node
        if (i === 2) nodeB = node
        if (node !== "0") {
          lines.push(`R_${sanitize(comp.id)}_${pinNames[i]} ${node} 0 10000`)
        }
      }
      return { lines, nodeA, nodeB }
    },
    computeElectricalState: (comp) => {
      // TMP36: output voltage = (temperature × 10mV) + 500mV
      const temp = (comp.properties.temperature as number) ?? 25
      const voltage = temp * 0.01 + 0.5
      return { isActive: true, voltage, current: 0, isReversed: false, brightness: 0 }
    },
    schematicSymbol: "temperature_sensor",
    schematicValue: (comp) => {
      const temp = (comp.properties.temperature as number) ?? 25
      return `TMP36 ${temp}°C`
    },
    generateSketch: (comp) => {
      const pin = comp.pins.signal
      if (pin == null) return null
      return {
        setupLines: [`  // ${comp.name} (TMP36) on analog pin A${(pin as number) - 14}`],
        loopLines: [
          `  int ${sanitize(comp.name)}Raw = analogRead(${pin}); // ${comp.name}`,
          `  float ${sanitize(comp.name)}Voltage = ${sanitize(comp.name)}Raw * (5.0 / 1023.0);`,
          `  float ${sanitize(comp.name)}TempC = (${sanitize(comp.name)}Voltage - 0.5) * 100.0;`,
        ],
        hasPin: true,
      }
    },
  },

  // ── Ultrasonic Sensor ─────────────────────────────────────────────────
  {
    type: "ultrasonic_sensor",
    category: "input",
    description: "HC-SR04 distance sensor — measures 2-400cm via echo",
    label: "Ultrasonic Sensor",
    defaultPins: { trigger: null, echo: null, vcc: null, gnd: null },
    // Vertical pin column: vcc → trig → echo → gnd, each in its own row.
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row: row + 1, col },
        { row: row + 2, col },
        { row: row + 3, col },
      ],
      width: HOLE_SPACING * 4,
      height: HOLE_SPACING * 4,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={2} y={8} width={20} height={8} rx={2} fill="#1e3a5f" stroke="#3b82f6" strokeWidth={1} />
        <circle cx={8} cy={12} r={2.5} fill="#1d4ed8" stroke="#3b82f6" strokeWidth={0.5} />
        <circle cx={16} cy={12} r={2.5} fill="#1d4ed8" stroke="#3b82f6" strokeWidth={0.5} />
      </svg>
    ),
    // Model VCC/trigger/echo/GND as 10kΩ input impedance (high-Z CMOS inputs).
    spicePrefix: "R",
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const pinNames = ["vcc", "trigger", "echo", "gnd"]
      const lines: string[] = []
      let nodeA = "0"
      let nodeB = "0"
      for (let i = 0; i < 4; i++) {
        const node = resolveNode(footprint.points[i])
        if (i === 0) nodeA = node
        if (i === 3) nodeB = node
        if (node !== "0") {
          lines.push(`R_${sanitize(comp.id)}_${pinNames[i]} ${node} 0 10000`)
        }
      }
      return { lines, nodeA, nodeB }
    },
    computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
      isActive: Math.abs(voltageDrop) > 2,
      voltage: voltageDrop,
      current: currentMa,
      isReversed: false,
      brightness: 0,
      warnings: [],
    }),
    generateSketch: (comp) => {
      const { trigger, echo } = comp.pins
      const lines: string[] = []
      let hasPin = false
      if (trigger != null) { lines.push(`  pinMode(${trigger}, OUTPUT); // ${comp.name} trigger`); hasPin = true }
      if (echo != null) { lines.push(`  pinMode(${echo}, INPUT); // ${comp.name} echo`); hasPin = true }
      return hasPin ? { setupLines: lines, hasPin } : null
    },
    schematicSymbol: "ultrasonic_sensor",
    schematicValue: () => "HC-SR04",
  },

  // ── LCD 16×2 ──────────────────────────────────────────────────────────
  {
    type: "lcd_16x2",
    category: "display",
    description: "16x2 character LCD display",
    label: "LCD 16×2",
    defaultPins: { rs: null, en: null, d4: null, d5: null, d6: null, d7: null },
    // Full HD44780 12-pin header (vss/vdd/vo/rs/rw/en/d4/d5/d6/d7/a/k) —
    // canonical layout owned by @dreamer/schemas so the breadboard render,
    // the SPICE netlist, and the simulator peripheral all resolve pins from
    // the same source. A 6-pin simplified footprint was here before and
    // silently disagreed with the peripheral's resolveComponentPins map.
    footprint: (row, col) => footprintFromPins("lcd_16x2", row, col, HOLE_SPACING * 6, HOLE_SPACING * 12),
    paletteIcon: (
      // HD44780 16×2 module: dark green PCB, yellow-green character panel,
      // corner mounting holes, bezel frame, silver trim pot.
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <defs>
          <linearGradient id="lcd-pal-pcb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0d5a3f" />
            <stop offset="100%" stopColor="#042f22" />
          </linearGradient>
          <linearGradient id="lcd-pal-screen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#c9f7de" />
            <stop offset="100%" stopColor="#8cdcb3" />
          </linearGradient>
        </defs>
        {/* PCB */}
        <rect x={1} y={4} width={22} height={16} rx={2} fill="url(#lcd-pal-pcb)" stroke="#02241a" strokeWidth={0.6} />
        {/* Corner mounting holes */}
        <circle cx={3}  cy={6}  r={0.9} fill="#011a12" stroke="#3a7a5a" strokeWidth={0.3} />
        <circle cx={21} cy={6}  r={0.9} fill="#011a12" stroke="#3a7a5a" strokeWidth={0.3} />
        {/* Screen bezel */}
        <rect x={2.5} y={7.5} width={19} height={9} rx={1} fill="#02241a" stroke="#011a12" strokeWidth={0.4} />
        {/* Active display */}
        <rect x={3.2} y={8.2} width={17.6} height={7.6} rx={0.5} fill="url(#lcd-pal-screen)" />
        {/* Character cells hint */}
        {[0, 1, 2, 3, 4, 5].map(i => (
          <rect key={`r1-${i}`} x={4 + i * 2.6} y={9} width={1.8} height={2.6} fill="#065f46" opacity={0.25} />
        ))}
        {[0, 1, 2, 3, 4, 5].map(i => (
          <rect key={`r2-${i}`} x={4 + i * 2.6} y={12.3} width={1.8} height={2.6} fill="#065f46" opacity={0.25} />
        ))}
        {/* Silkscreen */}
        <text x={3} y={18.8} fontSize={2} fill="#4a9e78" fontFamily="monospace" opacity={0.8}>HD44780</text>
        {/* Contrast trim pot */}
        <rect x={17.5} y={17.3} width={3.5} height={2.2} rx={0.3} fill="#1e40af" stroke="#0b2e80" strokeWidth={0.25} />
        <circle cx={19.25} cy={18.4} r={0.7} fill="#d4d4d8" />
      </svg>
    ),
    // Model the 6 control/data pins as high-impedance 10kΩ pull-downs.
    // This gives the SPICE solver a DC path without drawing meaningful
    // current. Resolved by name from the canonical pin map so the footprint
    // can carry its full 12-pin header without the netlist re-shuffling.
    spicePrefix: "R",
    buildNetlist: (comp, { resolveNode }) => {
      const pinMap = resolveComponentPins("lcd_16x2", comp.y, comp.x, comp.properties)
      const signalNames = ["rs", "en", "d4", "d5", "d6", "d7"] as const
      const lines: string[] = []
      let nodeA = "0"
      let nodeB = "0"
      for (let i = 0; i < signalNames.length; i++) {
        const name = signalNames[i]
        const hole = pinMap[name]
        if (!hole) continue
        const node = resolveNode(hole)
        if (i === 0) nodeA = node
        if (i === signalNames.length - 1) nodeB = node
        if (node !== "0") {
          lines.push(`R_${sanitize(comp.id)}_${name} ${node} 0 10000`)
        }
      }
      return { lines, nodeA, nodeB }
    },
    computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
      isActive: Math.abs(voltageDrop) > 2,
      voltage: voltageDrop,
      current: currentMa,
      isReversed: false,
      brightness: 0,
      warnings: [],
    }),
    generateSketch: (comp) => {
      const { rs, en, d4, d5, d6, d7 } = comp.pins
      if (rs == null || en == null || d4 == null || d5 == null || d6 == null || d7 == null) return null
      return {
        globalLines: [`LiquidCrystal lcd(${rs}, ${en}, ${d4}, ${d5}, ${d6}, ${d7});`],
        setupLines: [`  lcd.begin(16, 2); // ${comp.name}`],
        loopLines: [`  lcd.setCursor(0, 0);`, `  lcd.print("Hello, World!");`],
        hasPin: true,
      }
    },
    schematicSymbol: "lcd",
    schematicValue: () => "LCD 16×2",
  },

  // ── 7-Segment Display ─────────────────────────────────────────────────
  {
    type: "seven_segment",
    category: "display",
    description: "7-segment numeric display (0-9)",
    label: "7-Segment Display",
    defaultPins: { a: null, b: null, c: null, d: null, e: null, f: null, g: null, dp: null, gnd: null },
    // Vertical pin column: a..g, dp, gnd each in their own row so no two pins
    // share a breadboard net.
    footprint: (row, col) => footprintFromPins("seven_segment", row, col, HOLE_SPACING * 5, HOLE_SPACING * 9),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={4} y={3} width={16} height={18} rx={2} fill="#1f2937" stroke="#374151" strokeWidth={1} />
        <rect x={7} y={5} width={10} height={2} rx={1} fill="#ef4444" opacity={0.8} />
        <rect x={7} y={11} width={10} height={2} rx={1} fill="#ef4444" opacity={0.8} />
        <rect x={7} y={17} width={10} height={2} rx={1} fill="#ef4444" opacity={0.8} />
        <rect x={5} y={5} width={2} height={8} rx={1} fill="#ef4444" opacity={0.8} />
        <rect x={17} y={5} width={2} height={8} rx={1} fill="#ef4444" opacity={0.8} />
        <rect x={5} y={11} width={2} height={8} rx={1} fill="#ef4444" opacity={0.8} />
        <rect x={17} y={11} width={2} height={8} rx={1} fill="#ef4444" opacity={0.8} />
      </svg>
    ),
    spicePrefix: "R",
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const segments = ["a", "b", "c", "d", "e", "f", "g"] as const
      const lines: string[] = []

      for (let i = 0; i < segments.length; i++) {
        const point = footprint.points[i]
        if (!point) continue
        const node = resolveNode(point)
        // Common-cathode approximation: each segment acts like a branch to GND.
        if (node !== "0") {
          lines.push(`R_${sanitize(comp.id)}_${segments[i]} ${node} 0 220`)
        }
      }

      const nodeA = resolveNode(footprint.points[0] ?? { row: comp.y, col: comp.x })
      return {
        lines,
        nodeA,
        nodeB: "0",
      }
    },
    generateSketch: (comp) => {
      const segPins = [comp.pins.a, comp.pins.b, comp.pins.c, comp.pins.d, comp.pins.e, comp.pins.f, comp.pins.g]
      const dpPin = comp.pins.dp
      const assigned = segPins.filter(p => p != null)
      if (assigned.length === 0 && dpPin == null) return null
      const setupLines = segPins.map((p, i) => {
        const seg = "abcdefg"[i]
        return p != null ? `  pinMode(${p}, OUTPUT); // ${comp.name} segment ${seg}` : null
      }).filter(Boolean) as string[]
      if (dpPin != null) setupLines.push(`  pinMode(${dpPin}, OUTPUT); // ${comp.name} segment dp`)
      // Display digit 0 by default (segments a,b,c,d,e,f on, g off)
      const pattern = [1, 1, 1, 1, 1, 1, 0] // 0 = abcdef
      const loopLines = segPins.map((p, i) => {
        return p != null ? `  digitalWrite(${p}, ${pattern[i] ? "HIGH" : "LOW"}); // seg ${("abcdefg")[i]}` : null
      }).filter(Boolean) as string[]
      if (dpPin != null) loopLines.push(`  digitalWrite(${dpPin}, LOW); // seg dp`)
      return { setupLines, loopLines, hasPin: true }
    },
    schematicSymbol: "seven_segment",
    schematicValue: () => "7-Seg",
  },

  // ── NeoPixel / WS2812 LED Strip ──────────────────────────────────────
  {
    type: "neopixel",
    category: "output",
    description: "WS2812 addressable RGB LED strip",
    label: "NeoPixel Strip",
    defaultPins: { din: null, vcc: null, gnd: null },
    defaultProperties: { numLeds: 8 },
    accentColor: "#a855f7",
    // Vertical header: din / 5v / gnd each on their own row.
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row: row + 1, col },
        { row: row + 2, col },
      ],
      width: HOLE_SPACING * 5,
      height: HOLE_SPACING * 3,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={1} y={8} width={22} height={8} rx={2} fill="#1a1a1a" stroke="#333" strokeWidth={0.5} />
        {[4, 8, 12, 16, 20].map((x, i) => (
          <circle key={i} cx={x} cy={12} r={2.5} fill={["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7"][i]} opacity={0.9} />
        ))}
      </svg>
    ),
    buildNetlist: () => null,
    generateSketch: (comp) => {
      const pin = comp.pins.din
      if (pin == null) return null
      const numLeds = (comp.properties.numLeds as number) ?? 8
      return {
        globalLines: [
          `#include <Adafruit_NeoPixel.h>`,
          `Adafruit_NeoPixel strip(${numLeds}, ${pin}, NEO_GRB + NEO_KHZ800);`,
        ],
        setupLines: [
          `  strip.begin(); // ${comp.name}`,
          `  strip.setBrightness(50);`,
          `  strip.show();`,
        ],
        loopLines: [
          `  // ${comp.name}: rainbow cycle`,
          `  for (int i = 0; i < strip.numPixels(); i++) {`,
          `    strip.setPixelColor(i, strip.Color(255, 0, 0));`,
          `  }`,
          `  strip.show();`,
          `  delay(500);`,
        ],
        hasPin: true,
      }
    },
    schematicSymbol: "neopixel",
    schematicValue: (comp) => {
      const n = (comp.properties.numLeds as number) ?? 8
      return `WS2812 ×${n}`
    },
  },

  // ── PIR Motion Sensor ───────────────────────────────────────────────
  {
    type: "pir_sensor",
    category: "input",
    description: "HC-SR501 passive infrared motion detector",
    label: "PIR Sensor",
    defaultPins: { data: null },
    defaultProperties: {},
    accentColor: "#f59e0b",
    // Vertical header: vcc / signal / gnd each on their own row so no two
    // pins share a breadboard net.
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row: row + 1, col },
        { row: row + 2, col },
      ],
      width: HOLE_SPACING * 4,
      height: HOLE_SPACING * 3,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={4} y={10} width={16} height={10} rx={2} fill="#065f46" stroke="#064e3b" strokeWidth={0.8} />
        <circle cx={12} cy={8} r={6} fill="#d4d4d4" stroke="#a3a3a3" strokeWidth={0.8} />
        <circle cx={12} cy={8} r={3} fill="#fbbf24" opacity={0.6} />
      </svg>
    ),
    buildNetlist: () => null,
    generateSketch: (comp) => {
      const pin = comp.pins.data ?? comp.pins.signal
      if (pin == null) return null
      return {
        setupLines: [
          `  pinMode(${pin}, INPUT); // ${comp.name}`,
        ],
        loopLines: [
          `  if (digitalRead(${pin}) == HIGH) { // ${comp.name} motion detected`,
          `    Serial.println("Motion!");`,
          `  }`,
          `  delay(200);`,
        ],
        hasPin: true,
      }
    },
    schematicSymbol: "pir_sensor",
    schematicValue: () => "HC-SR501",
  },

  // ── Relay Module ────────────────────────────────────────────────────
  {
    type: "relay",
    category: "output",
    description: "Single-channel relay module for switching high-power loads",
    label: "Relay",
    defaultPins: { out: null },
    defaultProperties: {},
    accentColor: "#3b82f6",
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row: row + 1, col },
        { row: row + 2, col },
      ],
      width: HOLE_SPACING * 2,
      height: HOLE_SPACING * 3,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={3} y={3} width={18} height={18} rx={2} fill="#1e40af" stroke="#1e3a5f" strokeWidth={0.8} />
        <rect x={6} y={6} width={12} height={8} rx={1} fill="#3b82f6" opacity={0.4} />
        <text x={12} y={12} textAnchor="middle" fontSize={5} fill="#93c5fd" fontFamily="monospace">RELAY</text>
        <line x1={8} y1={18} x2={8} y2={22} stroke="#a0a0a0" strokeWidth={1} />
        <line x1={12} y1={18} x2={12} y2={22} stroke="#a0a0a0" strokeWidth={1} />
        <line x1={16} y1={18} x2={16} y2={22} stroke="#a0a0a0" strokeWidth={1} />
      </svg>
    ),
    buildNetlist: () => null,
    generateSketch: (comp) => {
      const pin = comp.pins.out ?? comp.pins.signal
      if (pin == null) return null
      return {
        setupLines: [`  pinMode(${pin}, OUTPUT); // ${comp.name}`],
        loopLines: [
          `  digitalWrite(${pin}, HIGH); // ${comp.name} ON`,
          `  delay(1000);`,
          `  digitalWrite(${pin}, LOW); // ${comp.name} OFF`,
          `  delay(1000);`,
        ],
        hasPin: true,
      }
    },
  },

  // ── DC Motor ────────────────────────────────────────────────────────
  {
    type: "dc_motor",
    category: "output",
    description: "Small DC motor — control speed with PWM via analogWrite()",
    label: "DC Motor",
    defaultPins: { signal: null },
    defaultProperties: {},
    accentColor: "#f97316",
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row: row + 1, col },
      ],
      width: HOLE_SPACING * 2,
      height: HOLE_SPACING * 2,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <circle cx={12} cy={12} r={8} fill="#374151" stroke="#6b7280" strokeWidth={1} />
        <circle cx={12} cy={12} r={5} fill="#1f2937" stroke="#4b5563" strokeWidth={0.5} />
        <line x1={12} y1={7} x2={12} y2={4} stroke="#a0a0a0" strokeWidth={1.5} strokeLinecap="round" />
        <text x={12} y={13} textAnchor="middle" fontSize={5} fill="#9ca3af" fontFamily="monospace">M</text>
      </svg>
    ),
    buildNetlist: () => null,
    generateSketch: (comp) => {
      const pin = comp.pins.signal
      if (pin == null) return null
      return {
        setupLines: [`  pinMode(${pin}, OUTPUT); // ${comp.name}`],
        loopLines: [
          `  analogWrite(${pin}, 128); // ${comp.name} half speed`,
          `  delay(2000);`,
          `  analogWrite(${pin}, 255); // ${comp.name} full speed`,
          `  delay(2000);`,
        ],
        hasPin: true,
      }
    },
  },

  // ── DHT Temperature + Humidity Sensor ───────────────────────────────
  {
    type: "dht_sensor",
    category: "input",
    description: "DHT11/DHT22 temperature and humidity sensor",
    label: "DHT Sensor",
    defaultPins: { signal: null },
    defaultProperties: { variant: "DHT11" },
    accentColor: "#06b6d4",
    // Vertical header: vcc / data / gnd each on their own row.
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row: row + 1, col },
        { row: row + 2, col },
      ],
      width: HOLE_SPACING * 4,
      height: HOLE_SPACING * 3,
    }),
    paletteIcon: (
      // DHT11 blue rectangular housing with vent grille on top half
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <defs>
          <linearGradient id="dht-pal-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#0e5070" />
            <stop offset="50%"  stopColor="#1a7ca8" />
            <stop offset="100%" stopColor="#0a3d5a" />
          </linearGradient>
        </defs>
        {/* Body */}
        <rect x={4} y={2} width={16} height={19} rx={2} fill="url(#dht-pal-body)" stroke="#0a3d5a" strokeWidth={0.6} />
        {/* Grille area background */}
        <rect x={6} y={4} width={12} height={8} rx={1} fill="#0e6d93" />
        {/* Vent holes — 3×2 grid */}
        {[0,1,2].map(col => [0,1].map(row => (
          <rect key={`${col}-${row}`}
            x={7 + col * 3.8} y={5.2 + row * 3.5}
            width={2.8} height={2.4} rx={0.8}
            fill="#063a52" opacity={0.9} />
        )))}
        {/* Separator line */}
        <line x1={6} y1={13} x2={18} y2={13} stroke="#0a3d5a" strokeWidth={0.5} />
        {/* Label text */}
        <text x={12} y={17.5} textAnchor="middle" fontSize={3.8}
          fill="#a5e8f7" fontFamily="monospace" fontWeight="bold">DHT11</text>
        {/* Three leads */}
        <line x1={9}  y1={21} x2={9}  y2={24} stroke="#b0b0b0" strokeWidth={1} />
        <line x1={12} y1={21} x2={12} y2={24} stroke="#b0b0b0" strokeWidth={1} />
        <line x1={15} y1={21} x2={15} y2={24} stroke="#b0b0b0" strokeWidth={1} />
      </svg>
    ),
    buildNetlist: () => null,
    generateSketch: (comp) => {
      const pin = comp.pins.signal
      if (pin == null) return null
      const variant = (comp.properties.variant as string) ?? "DHT11"
      return {
        globalLines: [
          `#include <DHT.h>`,
          `DHT dht(${pin}, ${variant});`,
        ],
        setupLines: [
          `  dht.begin(); // ${comp.name}`,
        ],
        loopLines: [
          `  float temp = dht.readTemperature(); // ${comp.name}`,
          `  float hum = dht.readHumidity();`,
          `  Serial.print("Temp: "); Serial.print(temp);`,
          `  Serial.print(" Humidity: "); Serial.println(hum);`,
          `  delay(2000);`,
        ],
        hasPin: true,
      }
    },
  },

  // ── IR Receiver ─────────────────────────────────────────────────────
  {
    type: "ir_receiver",
    category: "input",
    description: "Infrared receiver for remote control signals (38kHz)",
    label: "IR Receiver",
    defaultPins: { signal: null },
    defaultProperties: {},
    accentColor: "#dc2626",
    // Vertical pin column: out / gnd / vcc — matches the TSOP38238 pinout
    // and keeps each lead in its own breadboard net.
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row: row + 1, col },
        { row: row + 2, col },
      ],
      width: HOLE_SPACING * 3,
      height: HOLE_SPACING * 3,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <path d="M8 18 L8 10 A4 4 0 0 1 16 10 L16 18 Z" fill="#1a1a1a" stroke="#444" strokeWidth={0.8} />
        <circle cx={12} cy={10} r={3} fill="#7f1d1d" opacity={0.6} />
        <line x1={8} y1={20} x2={8} y2={22} stroke="#a0a0a0" strokeWidth={1} />
        <line x1={12} y1={20} x2={12} y2={22} stroke="#a0a0a0" strokeWidth={1} />
        <line x1={16} y1={20} x2={16} y2={22} stroke="#a0a0a0" strokeWidth={1} />
      </svg>
    ),
    buildNetlist: () => null,
    generateSketch: (comp) => {
      const pin = comp.pins.signal
      if (pin == null) return null
      return {
        globalLines: [
          `#include <IRremote.h>`,
          `IRrecv irrecv(${pin});`,
          `decode_results results;`,
        ],
        setupLines: [
          `  irrecv.enableIRIn(); // ${comp.name}`,
        ],
        loopLines: [
          `  if (irrecv.decode(&results)) { // ${comp.name}`,
          `    Serial.println(results.value, HEX);`,
          `    irrecv.resume();`,
          `  }`,
        ],
        hasPin: true,
      }
    },
  },

  // ── Shift Register (74HC595) ────────────────────────────────────────
  {
    type: "shift_register",
    category: "other",
    description: "74HC595 — 8-bit serial-in, parallel-out shift register",
    label: "Shift Register",
    defaultPins: { data: null, clock: null, latch: null },
    defaultProperties: {},
    accentColor: "#8b5cf6",
    footprint: (row, col) => {
      const points = []
      for (let r = 0; r < 4; r++) {
        points.push({ row: row + r, col: 2 })
        points.push({ row: row + r, col: 7 })
      }
      return { points, width: 60 + HOLE_SPACING * 4, height: HOLE_SPACING * 4 }
    },
    paletteIcon: (
      // DIP-16 IC: black body, 8 silver legs per side, notch at top, part number text
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <defs>
          <linearGradient id="sr-pal-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#111" />
            <stop offset="40%"  stopColor="#2a2a2a" />
            <stop offset="100%" stopColor="#0d0d0d" />
          </linearGradient>
        </defs>
        {/* IC body */}
        <rect x={6} y={2} width={12} height={20} rx={0.8} fill="url(#sr-pal-body)" stroke="#444" strokeWidth={0.6} />
        {/* Pin-1 notch at top */}
        <path d="M10 2 A2 2 0 0 0 14 2" fill="#0d0d0d" stroke="#555" strokeWidth={0.4} />
        {/* Pin-1 dot */}
        <circle cx={7.5} cy={4.5} r={0.9} fill="#4a7a4a" />
        {/* Left legs: 8 pins */}
        {[3.5,5.5,7.5,9.5,11.5,13.5,15.5,17.5].map(y => (
          <rect key={y} x={2} y={y - 0.7} width={4} height={1.4} fill="#b8b8b8" rx={0.3} />
        ))}
        {/* Right legs: 8 pins */}
        {[3.5,5.5,7.5,9.5,11.5,13.5,15.5,17.5].map(y => (
          <rect key={y} x={18} y={y - 0.7} width={4} height={1.4} fill="#b8b8b8" rx={0.3} />
        ))}
        {/* Label */}
        <text x={12} y={11.5} textAnchor="middle" fontSize={2.8}
          fill="#c8c8c8" fontFamily="monospace" fontWeight="bold">74HC595</text>
      </svg>
    ),
    buildNetlist: () => null,
    generateSketch: (comp) => {
      const data = comp.pins.data
      const clock = comp.pins.clock
      const latch = comp.pins.latch
      if (data == null || clock == null || latch == null) return null
      return {
        setupLines: [
          `  pinMode(${data}, OUTPUT); // ${comp.name} data`,
          `  pinMode(${clock}, OUTPUT); // ${comp.name} clock`,
          `  pinMode(${latch}, OUTPUT); // ${comp.name} latch`,
        ],
        loopLines: [
          `  // ${comp.name}: shift out byte`,
          `  digitalWrite(${latch}, LOW);`,
          `  shiftOut(${data}, ${clock}, MSBFIRST, 0b10101010);`,
          `  digitalWrite(${latch}, HIGH);`,
          `  delay(500);`,
        ],
        hasPin: true,
      }
    },
  },

  // ── OLED Display (SSD1306) ──────────────────────────────────────────
  {
    type: "oled_display",
    category: "display",
    description: "128x64 I2C OLED display (SSD1306)",
    label: "OLED Display",
    defaultPins: { sda: null, scl: null },
    defaultProperties: {},
    accentColor: "#06b6d4",
    // Vertical 4-pin header: gnd / vcc / scl / sda.
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row: row + 1, col },
        { row: row + 2, col },
        { row: row + 3, col },
      ],
      width: HOLE_SPACING * 6,
      height: HOLE_SPACING * 4,
    }),
    paletteIcon: (
      // SSD1306 module: navy PCB, black OLED panel, 4-pin header, mounting holes
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <defs>
          <linearGradient id="oled-pal-pcb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#1c2d54" />
            <stop offset="100%" stopColor="#0d1730" />
          </linearGradient>
        </defs>
        {/* PCB */}
        <rect x={1} y={2} width={22} height={17} rx={2} fill="url(#oled-pal-pcb)" stroke="#0d1a35" strokeWidth={0.6} />
        {/* Corner mounting holes */}
        <circle cx={3}  cy={4}  r={1} fill="#0d1730" stroke="#2a4a8a" strokeWidth={0.3} />
        <circle cx={21} cy={4}  r={1} fill="#0d1730" stroke="#2a4a8a" strokeWidth={0.3} />
        {/* Screen bezel */}
        <rect x={3} y={3.5} width={18} height={11} rx={1.2} fill="#06080f" stroke="#0a1830" strokeWidth={0.5} />
        {/* Active OLED area */}
        <rect x={4} y={4.5} width={16} height={9} rx={0.6} fill="#020408" />
        {/* Display content */}
        <text x={12} y={8.5} textAnchor="middle" fontSize={3.2}
          fill="#06b6d4" fontFamily="monospace" fontWeight="bold">0.96"</text>
        <text x={12} y={11.8} textAnchor="middle" fontSize={2.4}
          fill="#0891b2" fontFamily="monospace">SSD1306</text>
        {/* Scan line hints */}
        <line x1={5} y1={13.5} x2={19} y2={13.5} stroke="#06b6d4" strokeWidth={0.25} opacity={0.2} />
        {/* 4-pin header at bottom */}
        {[5, 9, 14, 18].map(x => (
          <g key={x}>
            <rect x={x - 1} y={15.5} width={2} height={3} rx={0.3} fill="#c8a84a" />
            <line x1={x} y1={18.5} x2={x} y2={22} stroke="#b0b0b0" strokeWidth={0.9} />
          </g>
        ))}
      </svg>
    ),
    buildNetlist: () => null,
    generateSketch: (comp) => {
      const sda = comp.pins.sda
      const scl = comp.pins.scl
      if (sda == null || scl == null) return null
      return {
        globalLines: [
          `#include <Wire.h>`,
          `#include <Adafruit_SSD1306.h>`,
          `Adafruit_SSD1306 display(128, 64, &Wire, -1);`,
        ],
        setupLines: [
          `  display.begin(SSD1306_SWITCHCAPVCC, 0x3C); // ${comp.name}`,
          `  display.clearDisplay();`,
          `  display.setTextSize(1);`,
          `  display.setTextColor(SSD1306_WHITE);`,
          `  display.setCursor(0, 0);`,
          `  display.println("Hello World!");`,
          `  display.display();`,
        ],
        loopLines: [],
        hasPin: true,
      }
    },
  },

  // ── IC Chip ───────────────────────────────────────────────────────────
  {
    type: "ic",
    category: "other",
    description: "Generic DIP integrated circuit chip",
    label: "IC Chip",
    defaultPins: {},
    footprint: (row, col) => {
      const pinCount = 8
      const rowCount = pinCount / 2
      const points = []
      for (let r = 0; r < rowCount; r++) {
        points.push({ row: row + r, col: 2 })
        points.push({ row: row + r, col: 7 })
      }
      return { points, width: 60 + HOLE_SPACING * 4, height: HOLE_SPACING * rowCount }
    },
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={6} y={4} width={12} height={16} rx={2} fill="#374151" stroke="#6b7280" strokeWidth={1} />
        {[6, 9, 12, 15].map(y => (
          <line key={`l${y}`} x1={2} y1={y} x2={6} y2={y} stroke="#9ca3af" strokeWidth={1} />
        ))}
        {[6, 9, 12, 15].map(y => (
          <line key={`r${y}`} x1={18} y1={y} x2={22} y2={y} stroke="#9ca3af" strokeWidth={1} />
        ))}
        <circle cx={8} cy={6} r={1} fill="#9ca3af" />
      </svg>
    ),
    buildNetlist: () => null,
    generateSketch: () => null,
  },

  // ── Power Supply (MB102-style breadboard PSU) ─────────────────────────
  //
  // Drops onto the top of the breadboard and feeds all four power rails.
  // Each side (left/right) has its own voltage selector (5V or 3.3V).
  // Footprint ignores the click column — pins are anchored to the four
  // rail columns (-2, -1, 10, 11), so wherever the user clicks horizontally
  // the module always lands across both rail pairs.
  {
    type: "power_supply",
    category: "other",
    description: "MB102 breadboard PSU — feeds 5V/3.3V to both power rails",
    label: "Power Supply",
    defaultPins: {},
    defaultProperties: { leftVoltage: 5, rightVoltage: 3.3 },
    accentColor: "#10b981",
    footprint: (row) => ({
      points: [
        { row, col: -2 },
        { row, col: -1 },
        { row, col: 10 },
        { row, col: 11 },
        { row: row + 1, col: -2 },
        { row: row + 1, col: -1 },
        { row: row + 1, col: 10 },
        { row: row + 1, col: 11 },
      ],
      width: HOLE_SPACING * 18,
      height: HOLE_SPACING * 2,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={2} y={6} width={20} height={12} rx={2} fill="#0c4a3a" stroke="#0e6b51" strokeWidth={1} />
        <rect x={6} y={9} width={6} height={6} rx={1} fill="#1a1a1a" />
        <circle cx={9} cy={12} r={1.4} fill="#404040" />
        <rect x={14} y={9} width={6} height={5} rx={0.6} fill="#9ca3af" />
        <text x={12} y={5} textAnchor="middle" fontSize={3} fill="#9ca3af" fontFamily="monospace">PSU</text>
      </svg>
    ),
    buildNetlist: (comp, { footprint, resolveNode }) => {
      // The 8 footprint points correspond to:
      //   0,4: left + rail (red)
      //   1,5: left − rail (blue, ground)
      //   2,6: right − rail (blue, ground)
      //   3,7: right + rail (red)
      const lPlusNode = resolveNode(footprint.points[0])
      const lMinusNode = resolveNode(footprint.points[1])
      const rMinusNode = resolveNode(footprint.points[2])
      const rPlusNode = resolveNode(footprint.points[3])

      const leftV = (comp.properties.leftVoltage as number | undefined) ?? 5
      const rightV = (comp.properties.rightVoltage as number | undefined) ?? 3.3

      const id = sanitize(comp.id)
      const lines: string[] = []

      // Tie both − rails to ground via a tiny resistor. Using 1Ω instead
      // of a hard short avoids the singular-matrix trap that 0Ω elements
      // create in spicey's MNA solver, while still being negligible
      // compared to any real load on the rail (the rail effectively
      // sits at < 1 mV under normal currents).
      lines.push(`R_${id}_LGND ${lMinusNode} 0 1`)
      lines.push(`R_${id}_RGND ${rMinusNode} 0 1`)

      // Voltage sources from each + rail to ground.
      lines.push(`V_${id}_L ${lPlusNode} 0 ${leftV}`)
      lines.push(`V_${id}_R ${rPlusNode} 0 ${rightV}`)

      // Report the left + rail and left − rail as the primary node pair
      // — the electrical state lookup uses these to display voltage/current.
      return { lines, nodeA: lPlusNode, nodeB: lMinusNode }
    },
    computeElectricalState: (_comp, { voltageDrop }) => ({
      // Always "active" — this is a power source, not a passive load.
      // We don't want the dim-when-inactive overlay obscuring the module.
      isActive: true,
      voltage: Math.abs(voltageDrop),
      current: 0,
      isReversed: false,
      brightness: 0,
    }),
    generateSketch: () => null,
  },

  // ── Multimeter (DC voltmeter probe) ───────────────────────────────────
  //
  // A simple test instrument: drop two probes onto any two breadboard rows
  // and the LCD on the body shows the DC voltage between them. The user
  // doesn't have to wire it to anything — it just reports whatever voltage
  // exists between the two grid points it's anchored to.
  //
  // Inserted into the netlist as a 10 MΩ element so it acts like a real
  // high-impedance voltmeter: the simulator gives us the voltage across
  // its two nodes for free via componentNodePairs / voltageDrop, and the
  // load is small enough that it doesn't perturb the circuit being tested.
  {
    type: "multimeter",
    category: "input",
    description: "Two-probe DMM — measures DC volts, current, or resistance",
    label: "Multimeter",
    defaultPins: {},
    // Probe A is the component's (x, y); probe B lives in properties so the
    // user can drop the two probes anywhere on the board (jumper-wire style).
    // `mode` selects what the LCD displays: "volts" (DC voltage drop between
    // probes), "amps" (current flowing through the meter — inserted as a
    // near-short in series), or "ohms" (resistance between the probes,
    // computed geometrically from the board state in the renderer).
    defaultProperties: { probeBRow: 1, probeBCol: 0, mode: "volts" },
    accentColor: "#fbbf24",
    footprint: (row, col, properties) => {
      const probeBRow = (properties?.probeBRow as number | undefined) ?? row + 1
      const probeBCol = (properties?.probeBCol as number | undefined) ?? col
      const minRow = Math.min(row, probeBRow)
      const maxRow = Math.max(row, probeBRow)
      const minCol = Math.min(col, probeBCol)
      const maxCol = Math.max(col, probeBCol)
      return {
        points: [
          { row, col },
          { row: probeBRow, col: probeBCol },
        ],
        width: (maxCol - minCol + 1) * HOLE_SPACING,
        height: (maxRow - minRow + 1) * HOLE_SPACING,
      }
    },
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={3} y={5} width={18} height={14} rx={2} fill="#fbbf24" stroke="#7c2d12" strokeWidth={1} />
        <rect x={5} y={7} width={14} height={5} rx={0.6} fill="#0a0a0a" />
        <rect x={5.5} y={7.5} width={13} height={4} rx={0.4} fill="#9ade7a" />
        <text x={18} y={11} textAnchor="end" fontSize={3.5} fill="#0a1f08" fontFamily="monospace" fontWeight="bold">5.00V</text>
        <circle cx={8} cy={16} r={1.2} fill="#ef4444" />
        <circle cx={16} cy={16} r={1.2} fill="#1f2937" />
      </svg>
    ),
    spicePrefix: "R",
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const nodeA = resolveNode(footprint.points[0])
      const nodeB = resolveNode(footprint.points[1])
      const mode = (comp.properties.mode as string | undefined) ?? "volts"
      // Amps mode: insert as a near-short (0.01 Ω) so the meter sits in
      // series and the solver reports the current flowing through it.
      // Volts / Ohms modes: 10 MΩ so the meter doesn't perturb the circuit
      // under test. (Ohms is read geometrically in the renderer, not from
      // SPICE, so the impedance choice doesn't affect its accuracy.)
      const resistance = mode === "amps" ? "0.01" : "10000000"
      return {
        lines: [`R_${sanitize(comp.id)} ${nodeA} ${nodeB} ${resistance}`],
        nodeA,
        nodeB,
      }
    },
    computeElectricalState: (_comp, { voltageDrop, currentMa }) => ({
      // Report BOTH the raw voltage drop (signed so reversed probes read
      // negative) and the current through the element. The renderer picks
      // which one to display based on the selected mode.
      isActive: true,
      voltage: voltageDrop,
      current: currentMa,
      isReversed: false,
      brightness: 0,
    }),
    generateSketch: () => null,
  },
]

// ── Lookup helpers ────────────────────────────────────────────────────────

const _registryMap = new Map<string, ComponentDefinition>(
  COMPONENT_REGISTRY.map(def => [def.type, def]),
)

/** Look up a component definition by type. Returns undefined for unknown types (wire, arduino_uno). */
export function getComponentDef(type: string): ComponentDefinition | undefined {
  return _registryMap.get(type)
}

// ── Private helpers ───────────────────────────────────────────────────────

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20)
}

function servoVarName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "myServo"
}

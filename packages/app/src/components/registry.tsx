// ── Component Registry ────────────────────────────────────────────────────
//
// The single source of truth for all component types.
//
// To add a new component:
//   1. Add its type to componentTypeSchema in packages/schemas/src/arduino.ts
//   2. Add a ComponentDefinition entry to COMPONENT_REGISTRY below
//   3. Optionally create a custom renderer in component-renderers/ and/or
//      a custom inspector in panels/inspector.tsx

import type React from "react"
import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import { buttonPressStore } from "@/simulator/button-press-store"
import { getCapVoltage } from "@/simulator/capacitor-state"
import type { ComponentDefinition } from "./component-definition"

// ── Icons ─────────────────────────────────────────────────────────────────

// Inline SVG icons so this file has no React component deps
function icon(content: React.ReactNode): React.ReactNode {
  return content
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
    footprint: (row, col) => ({
      points: [{ row, col }, { row: row + 1, col }],
      width: HOLE_SPACING,
      height: HOLE_SPACING * 2,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <ellipse cx={12} cy={10} rx={6} ry={7} fill="#ef4444" opacity={0.9} />
        <line x1={10} y1={17} x2={10} y2={21} stroke="#ccc" strokeWidth={1.5} />
        <line x1={14} y1={17} x2={14} y2={21} stroke="#ccc" strokeWidth={1.5} />
      </svg>
    ),
    // Model LED as a linearized resistor (≈120Ω ≈ Vf/typical_I) because
    // spicey's transient solver lacks Newton-Raphson for non-linear diodes.
    spicePrefix: "R",
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const nodeA = resolveNode(footprint.points[0])
      const nodeB = resolveNode(footprint.points[1])
      return {
        lines: [`R_${sanitize(comp.id)} ${nodeA} ${nodeB} 120`],
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
    defaultPins: { red: null, green: null, blue: null, cathode: null },
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
    spicePrefix: "R",
    buildNetlist: (comp, { footprint, resolveNode }) => {
      const nodeA = resolveNode(footprint.points[0])
      const nodeB = resolveNode(footprint.points[1])
      return {
        lines: [`R_${sanitize(comp.id)} ${nodeA} ${nodeB} 120`],
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
        if (pin != null && label !== "cathode") {
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
    footprint: (row) => ({
      points: [{ row, col: 3 }, { row, col: 6 }],
      width: HOLE_SPACING * 5,
      height: HOLE_SPACING,
    }),
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
    footprint: (row, col) => ({
      points: [{ row, col }, { row: row + 2, col }],
      width: HOLE_SPACING,
      height: HOLE_SPACING * 3,
    }),
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
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <path d="M12 3 C9.5 3 9.5 9 9.5 13 L9.5 13 C9.5 15.5 10.5 17 12 17 C13.5 17 14.5 15.5 14.5 13 L14.5 13 C14.5 9 14.5 3 12 3 Z" fill="#1a1a1a" stroke="#444" strokeWidth={1} />
        <circle cx={12} cy={14} r={2.5} fill="#ef4444" opacity={0.8} />
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
        // Common-cathode model: each segment is an LED+resistor branch to GND.
        // We use a linear 220Ω branch for stability in spicey's solver.
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
    computeElectricalState: (comp) => {
      // TMP36: output voltage = (temperature × 10mV) + 500mV
      const temp = (comp.properties.temperature as number) ?? 25
      const voltage = temp * 0.01 + 0.5
      return { isActive: true, voltage, current: 0, isReversed: false, brightness: 0 }
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
    buildNetlist: () => null,
    generateSketch: (comp) => {
      const { trigger, echo } = comp.pins
      const lines: string[] = []
      let hasPin = false
      if (trigger != null) { lines.push(`  pinMode(${trigger}, OUTPUT); // ${comp.name} trigger`); hasPin = true }
      if (echo != null) { lines.push(`  pinMode(${echo}, INPUT); // ${comp.name} echo`); hasPin = true }
      return hasPin ? { setupLines: lines, hasPin } : null
    },
  },

  // ── LCD 16×2 ──────────────────────────────────────────────────────────
  {
    type: "lcd_16x2",
    category: "display",
    description: "16x2 character LCD display",
    label: "LCD 16×2",
    defaultPins: { rs: null, en: null, d4: null, d5: null, d6: null, d7: null },
    // Vertical pin column: each of rs/en/d4/d5/d6/d7 on its own breadboard row.
    // On a real breadboard the LCD header is plugged into individual rows so
    // every pin is its own net; a horizontal footprint would short them.
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row: row + 1, col },
        { row: row + 2, col },
        { row: row + 3, col },
        { row: row + 4, col },
        { row: row + 5, col },
      ],
      width: HOLE_SPACING * 6,
      height: HOLE_SPACING * 6,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={1} y={5} width={22} height={14} rx={2} fill="#065f46" stroke="#064e3b" strokeWidth={1} />
        <rect x={3} y={7} width={18} height={10} rx={1} fill="#a7f3d0" />
        {[0, 1, 2, 3, 4, 5].map(i => (
          <rect key={i} x={4 + i * 2.8} y={9} width={2} height={3} fill="#065f46" opacity={0.3} />
        ))}
        {[0, 1, 2, 3, 4, 5].map(i => (
          <rect key={i} x={4 + i * 2.8} y={13} width={2} height={3} fill="#065f46" opacity={0.3} />
        ))}
      </svg>
    ),
    buildNetlist: () => null,
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
  },

  // ── 7-Segment Display ─────────────────────────────────────────────────
  {
    type: "seven_segment",
    category: "display",
    description: "7-segment numeric display (0-9)",
    label: "7-Segment Display",
    defaultPins: { a: null, b: null, c: null, d: null, e: null, f: null, g: null },
    // Vertical pin column: a..g each in their own row so no two segment pins
    // share a breadboard net.
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row: row + 1, col },
        { row: row + 2, col },
        { row: row + 3, col },
        { row: row + 4, col },
        { row: row + 5, col },
        { row: row + 6, col },
      ],
      width: HOLE_SPACING * 5,
      height: HOLE_SPACING * 7,
    }),
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
      const assigned = segPins.filter(p => p != null)
      if (assigned.length === 0) return null
      const setupLines = segPins.map((p, i) => {
        const seg = "abcdefg"[i]
        return p != null ? `  pinMode(${p}, OUTPUT); // ${comp.name} segment ${seg}` : null
      }).filter(Boolean) as string[]
      // Display digit 0 by default (segments a,b,c,d,e,f on, g off)
      const pattern = [1, 1, 1, 1, 1, 1, 0] // 0 = abcdef
      const loopLines = segPins.map((p, i) => {
        return p != null ? `  digitalWrite(${p}, ${pattern[i] ? "HIGH" : "LOW"}); // seg ${("abcdefg")[i]}` : null
      }).filter(Boolean) as string[]
      return { setupLines, loopLines, hasPin: true }
    },
  },

  // ── NeoPixel / WS2812 LED Strip ──────────────────────────────────────
  {
    type: "neopixel",
    category: "output",
    description: "WS2812 addressable RGB LED strip",
    label: "NeoPixel Strip",
    defaultPins: { din: null },
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
  },

  // ── PIR Motion Sensor ───────────────────────────────────────────────
  {
    type: "pir_sensor",
    category: "input",
    description: "HC-SR501 passive infrared motion detector",
    label: "PIR Sensor",
    defaultPins: { signal: null },
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
      const pin = comp.pins.signal
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
  },

  // ── Relay Module ────────────────────────────────────────────────────
  {
    type: "relay",
    category: "output",
    description: "Single-channel relay module for switching high-power loads",
    label: "Relay",
    defaultPins: { signal: null },
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
      const pin = comp.pins.signal
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
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={4} y={3} width={16} height={18} rx={2} fill="#0891b2" stroke="#0e7490" strokeWidth={0.8} />
        <rect x={7} y={6} width={10} height={6} rx={1} fill="#06b6d4" opacity={0.3} />
        <text x={12} y={10} textAnchor="middle" fontSize={4} fill="#a5f3fc" fontFamily="monospace">DHT</text>
        <line x1={8} y1={21} x2={8} y2={24} stroke="#a0a0a0" strokeWidth={1} />
        <line x1={12} y1={21} x2={12} y2={24} stroke="#a0a0a0" strokeWidth={1} />
        <line x1={16} y1={21} x2={16} y2={24} stroke="#a0a0a0" strokeWidth={1} />
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
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={5} y={3} width={14} height={18} rx={1} fill="#1a1a1a" stroke="#333" strokeWidth={0.8} />
        <path d="M10 3 A2 2 0 0 1 14 3" fill="#2a2a2a" stroke="#444" strokeWidth={0.5} />
        {[6, 9, 12, 15].map(y => (
          <g key={y}>
            <line x1={1} y1={y} x2={5} y2={y} stroke="#8b5cf6" strokeWidth={1} />
            <line x1={19} y1={y} x2={23} y2={y} stroke="#8b5cf6" strokeWidth={1} />
          </g>
        ))}
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
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={2} y={3} width={20} height={15} rx={2} fill="#1a1a1a" stroke="#333" strokeWidth={0.8} />
        <rect x={4} y={5} width={16} height={11} rx={1} fill="#000" />
        <text x={12} y={12} textAnchor="middle" fontSize={4} fill="#06b6d4" fontFamily="monospace">OLED</text>
        {[7, 11, 15, 19].map(x => (
          <line key={x} x1={x} y1={18} x2={x} y2={22} stroke="#a0a0a0" strokeWidth={0.8} />
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

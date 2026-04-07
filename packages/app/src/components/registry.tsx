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
    label: "Resistor",
    defaultPins: { a: null, b: null },
    defaultProperties: { resistance: 220 },
    accentColor: "#d2b48c",
    footprint: (row, col) => ({
      points: [{ row, col }, { row, col: col + 4 }],
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
    // Visual only — not included in SPICE netlist
    buildNetlist: () => null,
    generateSketch: () => null,
    schematicSymbol: "capacitor",
    schematicValue: (comp) => {
      const cap = comp.properties.capacitance as number | undefined
      return cap != null ? `${cap}µF` : undefined
    },
  },

  // ── Button ────────────────────────────────────────────────────────────
  {
    type: "button",
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
    buildNetlist: (comp, { footprint, resolveNode, pinStates }) => {
      const leftNode = resolveNode(footprint.points[0])
      const rightNode = resolveNode(footprint.points[2])
      const inputPin = comp.pins.a ?? comp.pins.input
      const isPressed = inputPin != null && pinStates.some(ps => ps.pin === inputPin && ps.digitalValue === 1)
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
    label: "Potentiometer",
    defaultPins: { vcc: null, signal: null, gnd: null },
    accentColor: "#78716c",
    footprint: (row, col) => ({
      points: [{ row, col }, { row, col: col + 1 }, { row, col: col + 2 }],
      width: HOLE_SPACING * 3,
      height: HOLE_SPACING * 2,
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
      const ratio = ((comp.properties.value as number) ?? 50) / 100
      return {
        lines: [
          `R_${sanitize(comp.id)}_A ${n1} ${n2} ${totalR * ratio}`,
          `R_${sanitize(comp.id)}_B ${n2} ${n3} ${totalR * (1 - ratio)}`,
        ],
        nodeA: n1,
        nodeB: n3,
      }
    },
    generateSketch: (comp) => {
      const pin = comp.pins.signal
      if (pin == null) return null
      return {
        setupLines: [`  // ${comp.name} on analog pin ${pin}`],
        hasPin: true,
      }
    },
    schematicSymbol: "potentiometer",
    schematicValue: () => "10kΩ pot",
  },

  // ── Buzzer ────────────────────────────────────────────────────────────
  {
    type: "buzzer",
    label: "Buzzer",
    defaultPins: { positive: null, negative: null },
    accentColor: "#1a1a1a",
    footprint: (row, col) => ({
      points: [{ row, col }, { row, col: col + 1 }],
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
    label: "Servo Motor",
    defaultPins: { signal: null, vcc: null, gnd: null },
    defaultProperties: { angle: 90 },
    accentColor: "#22c55e",
    footprint: (row, col) => ({
      points: [{ row, col }, { row, col: col + 1 }, { row, col: col + 2 }],
      width: HOLE_SPACING * 3,
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
    label: "Temperature Sensor",
    defaultPins: { vcc: null, signal: null, gnd: null },
    footprint: (row, col) => ({
      points: [{ row, col }, { row, col: col + 1 }, { row, col: col + 2 }],
      width: HOLE_SPACING * 3,
      height: HOLE_SPACING * 2,
    }),
    paletteIcon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <path d="M12 3 C9.5 3 9.5 9 9.5 13 L9.5 13 C9.5 15.5 10.5 17 12 17 C13.5 17 14.5 15.5 14.5 13 L14.5 13 C14.5 9 14.5 3 12 3 Z" fill="#1a1a1a" stroke="#444" strokeWidth={1} />
        <circle cx={12} cy={14} r={2.5} fill="#ef4444" opacity={0.8} />
      </svg>
    ),
    buildNetlist: () => null,
    generateSketch: (comp) => {
      const pin = comp.pins.signal
      if (pin == null) return null
      return { setupLines: [`  // ${comp.name} on pin ${pin}`], hasPin: true }
    },
  },

  // ── Ultrasonic Sensor ─────────────────────────────────────────────────
  {
    type: "ultrasonic_sensor",
    label: "Ultrasonic Sensor",
    defaultPins: { trigger: null, echo: null, vcc: null, gnd: null },
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row, col: col + 1 },
        { row, col: col + 2 },
        { row, col: col + 3 },
      ],
      width: HOLE_SPACING * 4,
      height: HOLE_SPACING * 2,
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
    label: "LCD 16×2",
    defaultPins: { rs: null, en: null, d4: null, d5: null, d6: null, d7: null },
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row, col: col + 1 },
        { row, col: col + 2 },
        { row, col: col + 3 },
        { row, col: col + 4 },
        { row, col: col + 5 },
      ],
      width: HOLE_SPACING * 6,
      height: HOLE_SPACING * 2,
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
    label: "7-Segment Display",
    defaultPins: { a: null, b: null, c: null, d: null, e: null, f: null, g: null },
    footprint: (row, col) => ({
      points: [
        { row, col },
        { row, col: col + 1 },
        { row, col: col + 2 },
        { row, col: col + 3 },
        { row, col: col + 4 },
        { row, col: col + 5 },
        { row, col: col + 6 },
      ],
      width: HOLE_SPACING * 7,
      height: HOLE_SPACING * 2,
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
    buildNetlist: () => null,
    generateSketch: () => null,
  },

  // ── IC Chip ───────────────────────────────────────────────────────────
  {
    type: "ic",
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

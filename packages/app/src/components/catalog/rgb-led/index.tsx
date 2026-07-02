import { resolveComponentPins } from "@dreamer/schemas"
import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import { diodeModelLine, getRgbLedDiodeModel, ledNetlistLines } from "@/simulator/diode-model"
import type { ComponentDefinition, ElectricalOutput } from "@/components/component-definition"
import { sanitize } from "@/components/catalog/_shared"

export const rgbLed: ComponentDefinition = {
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
  // All three channels are real diode branches so green/blue draw current
  // like red does. The red branch keeps the bare sanitized id — that's the
  // element name the circuit solver's `D_<id>` current lookup resolves, so
  // computeElectricalState stays anchored on red as before.
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const pinPoints = resolveComponentPins("rgb_led", comp.y, comp.x, comp.properties)
    const commonPoint = pinPoints.common ?? footprint.points[3] ?? footprint.points[1] ?? footprint.points[0]
    const nodeB = resolveNode(commonPoint)
    const model = getRgbLedDiodeModel()
    const id = sanitize(comp.id)

    const channels: Array<{ suffix: string; point: typeof commonPoint | undefined }> = [
      { suffix: "", point: pinPoints.red ?? footprint.points[0] },
      { suffix: "_g", point: pinPoints.green ?? footprint.points[1] },
      { suffix: "_b", point: pinPoints.blue ?? footprint.points[2] },
    ]
    const lines: string[] = []
    let nodeA = nodeB
    for (const { suffix, point } of channels) {
      if (!point) continue
      const node = resolveNode(point)
      if (suffix === "") nodeA = node
      if (node === nodeB) continue // unwired channel collapsing onto common
      const branch = ledNetlistLines(`${id}${suffix}`, node, nodeB, model)
      lines.push(...branch.lines)
    }
    if (lines.length === 0) return null
    return { lines, modelLines: [diodeModelLine(model)], nodeA, nodeB }
  },
  computeElectricalState: (comp, { voltageDrop, currentMa }) => {
    const isReversed = voltageDrop < -0.1
    const isActive = Math.abs(currentMa) > 0.5 && voltageDrop > 0.1
    const brightness = isActive ? Math.min(1, Math.max(0, currentMa / 20)) : 0
    const warnings: NonNullable<ElectricalOutput["warnings"]> = []
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
}

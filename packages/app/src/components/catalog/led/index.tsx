import { resolveComponentPins } from "@dreamer/schemas"
import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import { diodeModelLine, getLedDiodeModel } from "@/simulator/diode-model"
import type { ComponentDefinition, ElectricalOutput } from "@/components/component-definition"
import { footprintFromPins, sanitize } from "@/components/catalog/_shared"

export const led: ComponentDefinition = {
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
    const warnings: NonNullable<ElectricalOutput["warnings"]> = []
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
}

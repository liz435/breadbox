import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import type { ComponentDefinition } from "@/components/component-definition"

// A virtual handheld remote. It's wireless — it occupies no breadboard
// holes and has no pins or netlist. Clicking a button beams an NEC code to
// every IR receiver on the board via irRemoteStore (see ir-remote-renderer
// + sensor-inputs.writeIrReceiver). Position comes from x/y; the empty
// footprint keeps it from blocking holes wherever it's dropped.
export const irRemote: ComponentDefinition = {
  type: "ir_remote",
  category: "input",
  description: "Virtual IR remote — click a button to beam a code to any IR receiver",
  label: "IR Remote",
  defaultPins: {},
  defaultProperties: {},
  accentColor: "#dc2626",
  footprint: () => ({
    points: [],
    width: HOLE_SPACING * 5,
    height: HOLE_SPACING * 9,
  }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={7} y={2} width={10} height={20} rx={3} fill="#1f2937" stroke="#4b5563" strokeWidth={0.8} />
      <circle cx={12} cy={5} r={1.2} fill="#dc2626" />
      <circle cx={9.5} cy={9} r={1} fill="#9ca3af" />
      <circle cx={14.5} cy={9} r={1} fill="#9ca3af" />
      <circle cx={9.5} cy={12.5} r={1} fill="#9ca3af" />
      <circle cx={14.5} cy={12.5} r={1} fill="#9ca3af" />
      <circle cx={9.5} cy={16} r={1} fill="#9ca3af" />
      <circle cx={14.5} cy={16} r={1} fill="#9ca3af" />
    </svg>
  ),
  buildNetlist: () => null,
  generateSketch: () => null,
}

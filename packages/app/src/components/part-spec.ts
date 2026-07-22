// ── Renderer-independent part contract ────────────────────────────────────
// Circuit facts live here so a project can be resolved, simulated, or exported
// without importing a React renderer or a Three.js scene.

import type { BoardComponent, PinState, Wire } from "@dreamer/schemas"
import type { ComponentFootprint, GridPoint } from "@/breadboard/breadboard-grid"
import type { PeripheralState } from "@/simulator/peripherals/types"

export type PartNetlistContext = {
  footprint: ComponentFootprint
  resolveNode: (point: GridPoint) => string
  pinStates: PinState[]
  wires: Record<string, Wire>
  /** Full board topology when emitted by the simulator. Optional so part
   * definitions remain usable in isolated catalog tooling. */
  components?: Record<string, BoardComponent>
  /** Latest peripheral snapshot for stateful electrical loads. */
  peripheralStates?: Record<string, PeripheralState>
  mode: "op" | "transient"
}

export type PartNetlistOutput = {
  lines: string[]
  modelLines?: string[]
  nodeA: string
  nodeB: string
  /** Explicit supply emitted by this part. The element is the SPICE voltage
   * source whose branch current represents the source load; node is its
   * externally available output after any source resistance. */
  supplySources?: Array<{
    id: string
    label: string
    element: string
    node: string
    /** The source's own return node. A device grounded here is genuinely
     * grounded even though the node isn't SPICE node "0" — an MB102 ties its
     * − rails to 0 through a 1Ω resistor, so they are real nets. */
    returnNode?: string
    nominalVoltage: number
    currentLimitMa: number
    sourceResistanceOhms?: number
  }>
}

/**
 * What this part needs from the supply to operate at all.
 *
 * `supply` is asked a ground-referenced question — "is there voltage at this
 * node" — deliberately NOT "what is the voltage across the part". A part whose
 * return path IS its driven pin (the DC motor returns through its low-side
 * driver) would otherwise read as unpowered whenever the driver is off, and
 * under PWM would be gated off on every low phase.
 */
export type PartPowerModel = {
  /** Candidate pin names, in preference order, for the part's supply input. */
  supply: readonly string[]
  /** Candidate pin names for the return. Omit when the return path is the
   * part's driven pin — drive state is not a power question. */
  return?: readonly string[]
  minOperatingVolts: number
}

export type PartSpec = {
  type: string
  label: string
  category?: "output" | "input" | "passive" | "display" | "other"
  description?: string
  defaultPins: Record<string, null>
  defaultProperties?: Record<string, unknown>
  footprint: (row: number, col: number, properties?: Record<string, unknown>) => ComponentFootprint
  spicePrefix?: string
  buildNetlist?: (component: BoardComponent, context: PartNetlistContext) => PartNetlistOutput | null
  /** Supply requirement. Omit for parts the power model cannot describe (a
   * two-terminal passive has no supply pin) — they are left ungated rather
   * than reported permanently dead. */
  power?: PartPowerModel
}

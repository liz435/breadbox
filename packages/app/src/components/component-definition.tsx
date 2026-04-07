// ── Component Definition ─────────────────────────────────────────────────
//
// A ComponentDefinition is the single source of truth for everything a
// component needs to participate in the app. Define one object per
// component type; all consuming systems read from the registry.
//
// To add a new component:
//   1. Add its type string to componentTypeSchema in packages/schemas/src/arduino.ts
//   2. Create a definition object here and add it to COMPONENT_REGISTRY in registry.ts
//   3. Optionally add a dedicated renderer in component-renderers/ and inspector in panels/
//      (both fall back gracefully if omitted)

import type { ReactNode } from "react"
import type { BoardComponent, PinState } from "@dreamer/schemas"
import type { ComponentFootprint, GridPoint } from "@/breadboard/breadboard-grid"
import type { SchematicSymbolType } from "@/schematic/schematic-symbols"

// ── Sketch generation ─────────────────────────────────────────────────────

export type SketchOutput = {
  /** Lines added once at the top of the file (includes, global declarations) */
  globalLines?: string[]
  /** Lines inside setup() */
  setupLines?: string[]
  /** Lines inside loop() */
  loopLines?: string[]
  /** Whether at least one pin was assigned (suppresses the "no pins" fallback sketch) */
  hasPin?: boolean
}

// ── SPICE netlist generation ──────────────────────────────────────────────

export type NetlistContext = {
  footprint: ComponentFootprint
  /**
   * Resolve a grid point to its SPICE node name (e.g. "net_abc" or "0" for ground).
   * Falls back to a unique unconnected node if the point isn't in any net.
   */
  resolveNode: (point: GridPoint) => string
  /** Current pin states for all 20 Arduino pins */
  pinStates: PinState[]
}

export type NetlistOutput = {
  /** SPICE element lines to append to the netlist (e.g. "R_foo net_a net_b 220") */
  lines: string[]
  /** Primary node A for this component (used by circuit solver to look up voltage/current) */
  nodeA: string
  /** Primary node B */
  nodeB: string
}

// ── Electrical state ──────────────────────────────────────────────────────

export type ElectricalContext = {
  /** Voltage difference vA - vB across the component */
  voltageDrop: number
  /** Absolute current in mA */
  currentMa: number
  /** SPICE element name used (for looking up element currents) */
  elementName: string
}

export type ElectricalOutput = {
  isActive: boolean
  voltage: number
  current: number
  isReversed?: boolean
  brightness?: number
  warnings?: Array<{
    type: "no_resistor" | "reverse_polarity" | "overcurrent" | "open_circuit" | "short_circuit"
    message: string
  }>
  /** Whether to emit a current-path animation for this component */
  emitCurrentPath?: boolean
}

// ── Component Definition ──────────────────────────────────────────────────

export type ComponentDefinition = {
  // ── Identity ──────────────────────────────────────────────────────────

  /** Must match the zod enum in @dreamer/schemas */
  type: string

  /** Human-readable label used in the inspector title and palette */
  label: string

  // ── Breadboard placement ──────────────────────────────────────────────

  /**
   * Default pin assignments (all null = unassigned).
   * Keys become the named pins shown in the inspector.
   */
  defaultPins: Record<string, null>

  /** Default component-specific properties (e.g. { resistance: 220 }) */
  defaultProperties?: Record<string, unknown>

  /**
   * Physical grid footprint: which holes the component occupies and its pixel dimensions.
   * row/col are the component's placement position on the breadboard.
   */
  footprint: (row: number, col: number) => ComponentFootprint

  // ── Visual ────────────────────────────────────────────────────────────

  /** Color used for occupied-hole indicators on the breadboard canvas */
  accentColor?: string

  // ── Palette ───────────────────────────────────────────────────────────

  /** SVG icon shown in the component palette. */
  paletteIcon: ReactNode

  // ── Simulation ────────────────────────────────────────────────────────

  /**
   * Emit SPICE netlist elements for this component.
   * Return null to skip (component is visual-only).
   */
  buildNetlist?: (comp: BoardComponent, ctx: NetlistContext) => NetlistOutput | null

  /**
   * SPICE element prefix: "R" for resistors, "D" for diodes.
   * Used by the circuit solver to look up element currents.
   * Defaults to "R".
   */
  spicePrefix?: string

  /**
   * Compute per-component electrical state from the solved circuit.
   * Return null to use the generic fallback (sets voltage/current, isActive=false).
   */
  computeElectricalState?: (
    comp: BoardComponent,
    ctx: ElectricalContext,
  ) => ElectricalOutput | null

  // ── Sketch generation ─────────────────────────────────────────────────

  /**
   * Generate Arduino sketch lines for this component.
   * Return null to skip.
   */
  generateSketch?: (comp: BoardComponent) => SketchOutput | null

  // ── Schematic ─────────────────────────────────────────────────────────

  /** Symbol type to render in the schematic view. Omit to exclude from schematic. */
  schematicSymbol?: SchematicSymbolType

  /** Human-readable value string shown next to the symbol (e.g. "220Ω", "Red LED") */
  schematicValue?: (comp: BoardComponent) => string | undefined
}

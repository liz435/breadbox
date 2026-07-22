// ── Plugin Host SDK ────────────────────────────────────────────────────────
//
// The contract a user-authored custom component is written against. A custom
// part is an ES module whose default export is a factory `(host) => host.
// defineComponent({...})`. It receives the host (constants + helpers) rather
// than importing app internals, because it is loaded at runtime — outside the
// bundle — and `@/...` aliases don't exist there.
//
// `defineComponent` normalizes the author's spec into a standard
// ComponentDefinition (the same interface built-ins use), so a registered
// custom part flows through the existing simulator, schematic, and palette
// with no special-casing. Author callbacks are wrapped so a throwing plugin
// degrades gracefully instead of crashing the app.

import { createElement } from "react"
import type { ComponentType, ReactNode } from "react"
import type { BoardComponent, DslBinding } from "@dreamer/schemas"
import type { Peripheral } from "@/simulator/peripherals/types"
import { HOLE_SPACING } from "@/breadboard/breadboard-constants"
import { svgToDataUrl } from "@/utils/svg-data-url"
import type {
  ComponentDefinition,
  NetlistContext,
  NetlistOutput,
  ElectricalContext,
  ElectricalOutput,
  SketchOutput,
} from "@/components/component-definition"
import type { ComponentRendererProps } from "@/breadboard/component-renderers/renderer-types"
import type { PartPowerModel } from "@/components/part-spec"
import { sanitize } from "@/components/catalog/_shared"

export type PluginPinRole = "power" | "ground" | "digital" | "analog" | "io"

/** A pin declared by a plugin: a name and its grid offset from the placement origin. */
export type PluginPin = {
  name: string
  dx: number
  dy: number
  role?: PluginPinRole
}

/** Ergonomic helpers passed to a plugin's buildNetlist so it can resolve nodes by pin name. */
export type PluginNetlistApi = {
  /** Resolve a named pin to its SPICE node for the placed component. */
  pin: (name: string) => string
  /** Read a component property, with an optional fallback. */
  prop: <T = unknown>(name: string, fallback?: T) => T
  /** The sanitized, SPICE-safe component id. */
  id: string
  sanitize: (value: string) => string
}

/** The spec a plugin author hands to `host.defineComponent`. */
export type PluginComponentSpec = {
  type: string
  label: string
  category?: ComponentDefinition["category"]
  description?: string
  pins: PluginPin[]
  /** Default, user-tweakable properties (shown in the inspector). */
  properties?: Record<string, unknown>
  /** Pixel size of the body; defaults to the pin extent. */
  size?: { width: number; height: number }
  accentColor?: string
  /** Raw SVG body markup, scaled to the footprint with pins overlaid. */
  svg?: string
  paletteIcon?: ReactNode
  spicePrefix?: string
  /** Supply requirement. Omit to leave the part ungated by the power model. */
  power?: PartPowerModel
  buildNetlist?: (comp: BoardComponent, ctx: NetlistContext, api: PluginNetlistApi) => NetlistOutput | null
  computeElectricalState?: (comp: BoardComponent, ctx: ElectricalContext) => ElectricalOutput | null
  generateSketch?: (comp: BoardComponent) => SketchOutput | null
  renderer?: ComponentType<ComponentRendererProps>
  /** Join the simulator's peripheral bus (pin edges / ticks / state snapshots). */
  createPeripheral?: (comp: BoardComponent) => Peripheral | null
  /** Animate elements of `svg` (by id) from behavior signal values. */
  visualBindings?: DslBinding[]
  /** Signal names, for zero-filling binding expressions before the sim runs. */
  signalNames?: string[]
}

/** The host API injected into a plugin factory. */
export type PluginHost = {
  HOLE_SPACING: number
  sanitize: (value: string) => string
  /**
   * The host's React.createElement, for building palette icons / renderers
   * without JSX (plugin modules are transpiled with a no-JSX loader). Using the
   * host's React keeps a single React instance — no dual-copy hook breakage.
   */
  h: typeof createElement
  defineComponent: (spec: PluginComponentSpec) => ComponentDefinition
}

/** A custom-component module's default export: a factory returning one definition. */
export type CustomComponentModule = (host: PluginHost) => ComponentDefinition

const CUSTOM_TYPE = /^custom:[a-z0-9-]+$/

function defaultPaletteIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={4} y={4} width={16} height={16} rx={3} fill="#475569" stroke="#94a3b8" strokeWidth={1} />
      <circle cx={8} cy={8} r={1} fill="#cbd5e1" />
    </svg>
  )
}

/** A palette icon that snapshots the part's own SVG body. */
function svgPaletteIcon(svg: string): ReactNode {
  // A fixed 20×20 box, matching the built-in SVG icons; object-contain scales the
  // part's SVG to fit. The size MUST come from CSS (`size-5`), not width/height
  // attributes — Tailwind preflight forces `img { height: auto }`, so a tall
  // viewBox would otherwise render oversized.
  return <img src={svgToDataUrl(svg)} alt="" className="size-5 shrink-0 object-contain" />
}

function pinExtent(pins: PluginPin[]): { width: number; height: number } {
  const dxs = pins.map((p) => p.dx)
  const dys = pins.map((p) => p.dy)
  return {
    width: (Math.max(...dxs) - Math.min(...dxs) + 1) * HOLE_SPACING,
    height: (Math.max(...dys) - Math.min(...dys) + 1) * HOLE_SPACING,
  }
}

export function createPluginHost(): PluginHost {
  return {
    HOLE_SPACING,
    sanitize,
    h: createElement,
    defineComponent(spec) {
      if (!CUSTOM_TYPE.test(spec.type)) {
        throw new Error(`Custom component type must match custom:<kebab-name> (got "${spec.type}")`)
      }
      if (!spec.label) throw new Error(`Custom component "${spec.type}" needs a label`)
      if (!spec.pins || spec.pins.length === 0) {
        throw new Error(`Custom component "${spec.type}" needs at least one pin`)
      }

      const pinByName = new Map(spec.pins.map((p) => [p.name, p]))
      const defaultPins: Record<string, null> = {}
      for (const p of spec.pins) defaultPins[p.name] = null

      const size = spec.size ?? pinExtent(spec.pins)

      const footprint: ComponentDefinition["footprint"] = (row, col) => ({
        points: spec.pins.map((p) => ({ row: row + p.dy, col: col + p.dx })),
        width: size.width,
        height: size.height,
      })

      const makeApi = (comp: BoardComponent, ctx: NetlistContext): PluginNetlistApi => ({
        pin: (name) => {
          const p = pinByName.get(name)
          if (!p) throw new Error(`Unknown pin "${name}" on ${spec.type}`)
          return ctx.resolveNode({ row: comp.y + p.dy, col: comp.x + p.dx })
        },
        // properties is an untyped bag at this boundary; the cast narrows it.
        prop: <T = unknown>(name: string, fallback?: T) => {
          const value = comp.properties[name]
          return (value === undefined ? fallback : value) as T
        },
        id: sanitize(comp.id),
        sanitize,
      })

      const userBuildNetlist = spec.buildNetlist
      const buildNetlist: ComponentDefinition["buildNetlist"] = userBuildNetlist
        ? (comp, ctx) => {
            try {
              return userBuildNetlist(comp, ctx, makeApi(comp, ctx))
            } catch (err) {
              console.error(`[${spec.type}] buildNetlist failed`, err)
              return null
            }
          }
        : undefined

      const userElectrical = spec.computeElectricalState
      const computeElectricalState: ComponentDefinition["computeElectricalState"] = userElectrical
        ? (comp, ctx) => {
            try {
              return userElectrical(comp, ctx)
            } catch (err) {
              console.error(`[${spec.type}] computeElectricalState failed`, err)
              return null
            }
          }
        : undefined

      const userSketch = spec.generateSketch
      const generateSketch: ComponentDefinition["generateSketch"] = userSketch
        ? (comp) => {
            try {
              return userSketch(comp)
            } catch (err) {
              console.error(`[${spec.type}] generateSketch failed`, err)
              return null
            }
          }
        : undefined

      return {
        type: spec.type,
        label: spec.label,
        category: spec.category ?? "other",
        description: spec.description,
        defaultPins,
        defaultProperties: spec.properties,
        accentColor: spec.accentColor,
        svg: spec.svg,
        renderer: spec.renderer,
        footprint,
        paletteIcon:
          spec.paletteIcon ?? (spec.svg ? svgPaletteIcon(spec.svg) : defaultPaletteIcon()),
        spicePrefix: spec.spicePrefix,
        power: spec.power,
        buildNetlist,
        computeElectricalState,
        generateSketch,
        createPeripheral: spec.createPeripheral,
        visualBindings: spec.visualBindings,
        signalNames: spec.signalNames,
      }
    },
  }
}

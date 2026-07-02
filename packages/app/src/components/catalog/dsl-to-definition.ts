// ── DSL → ComponentDefinition ────────────────────────────────────────────────
//
// Compiles a declarative custom-component DSL (data) into the same runtime
// ComponentDefinition the code-module form produces, by generating buildNetlist
// (walk the element list, resolve named pins, evaluate expressions) and
// generateSketch (expand templates) and feeding them through the plugin host's
// defineComponent — so footprint derivation, defaults, and error isolation are
// shared with code parts.

import type { BoardComponent } from "@dreamer/schemas"
import { evaluateExpression, type CustomComponentDsl, type DslElement } from "@dreamer/schemas"
import type { ComponentDefinition, NetlistOutput, SketchOutput } from "@/components/component-definition"
import { createPluginHost, type PluginNetlistApi } from "@/components/catalog/plugin-host"
import { createCustomDslPeripheral } from "@/simulator/peripherals/custom-dsl"

function numericContext(props: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "number") out[key] = value
  }
  return out
}

function buildNetlistFromElements(
  elements: DslElement[],
  comp: BoardComponent,
  api: PluginNetlistApi,
): NetlistOutput | null {
  if (elements.length === 0) return null
  const ctx = numericContext(comp.properties)
  const num = (v: number | string): number => (typeof v === "number" ? v : evaluateExpression(v, ctx))
  // A ref is a declared pin name, or "0" for SPICE ground.
  const node = (ref: string): string => (ref === "0" ? "0" : api.pin(ref))

  const lines: string[] = []
  let nodeA = "0"
  let nodeB = "0"
  elements.forEach((el, i) => {
    const tag = `${api.id}_${i}`
    let a = "0"
    let b = "0"
    if (el.kind === "resistor") {
      a = node(el.a)
      b = node(el.b)
      lines.push(`R_${tag} ${a} ${b} ${num(el.ohms)}`)
    } else if (el.kind === "source") {
      a = node(el.plus)
      b = node(el.minus)
      lines.push(`V_${tag} ${a} ${b} ${num(el.volts)}`)
    } else {
      // input_impedance: a pulldown from the pin to ground.
      a = node(el.pin)
      b = "0"
      lines.push(`R_${tag} ${a} 0 ${num(el.ohms)}`)
    }
    if (i === 0) {
      nodeA = a
      nodeB = b
    }
  })
  return { lines, nodeA, nodeB }
}

function expandTemplate(line: string, comp: BoardComponent): string {
  return line
    .replace(/\{\{name\}\}/g, comp.name)
    .replace(/\{\{pin\.([a-zA-Z0-9_]+)\}\}/g, (_match, pin: string) => {
      const value = comp.pins[pin]
      return value == null ? "" : String(value)
    })
}

function buildSketch(
  sketch: NonNullable<CustomComponentDsl["sketch"]>,
  comp: BoardComponent,
): SketchOutput | null {
  const globalLines = [...sketch.includes, ...sketch.globals].map((l) => expandTemplate(l, comp))
  const setupLines = sketch.setup.map((l) => expandTemplate(l, comp))
  const loopLines = sketch.loop.map((l) => expandTemplate(l, comp))
  const hasPin = setupLines.length > 0 || loopLines.length > 0
  if (globalLines.length === 0 && !hasPin) return null
  return { globalLines, setupLines, loopLines, hasPin }
}

/** Compile a declarative custom-component DSL into a runtime ComponentDefinition. */
export function dslToComponentDefinition(dsl: CustomComponentDsl): ComponentDefinition {
  const host = createPluginHost()
  const elements = dsl.electrical.elements
  const sketch = dsl.sketch
  const signals = dsl.behavior?.signals ?? []
  const bindings = dsl.visual?.bindings ?? []
  return host.defineComponent({
    type: dsl.type,
    label: dsl.label,
    category: dsl.category,
    description: dsl.description,
    pins: dsl.pins,
    properties: dsl.properties,
    size: dsl.size,
    accentColor: dsl.accentColor,
    svg: dsl.svg,
    buildNetlist:
      elements.length === 0
        ? undefined
        : (comp, _ctx, api) => buildNetlistFromElements(elements, comp, api),
    generateSketch: sketch ? (comp) => buildSketch(sketch, comp) : undefined,
    createPeripheral:
      signals.length === 0 ? undefined : (comp) => createCustomDslPeripheral(dsl, comp),
    visualBindings: bindings.length === 0 ? undefined : bindings,
    signalNames: signals.length === 0 ? undefined : signals.map((s) => s.name),
  })
}

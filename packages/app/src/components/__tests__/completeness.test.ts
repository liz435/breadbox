// ── Component completeness matrix ────────────────────────────────────────
//
// Every subsystem a component participates in degrades SILENTLY for an
// unhandled type: the netlist builder skips its stamp, the schematic falls
// back to a generic box, pin resolution returns no named pins. This suite
// pins the full matrix to the schema's ComponentType list so a new type
// (or a dropped handler) must consciously update the expectations here —
// it cannot fall through the cracks unnoticed.

import { describe, expect, test } from "bun:test"
import {
  BOARD_COMPONENT_TYPES,
  componentTypeSchema,
  getComponentPinNames,
} from "@dreamer/schemas"
import { COMPONENT_REGISTRY } from "../registry"
import { SCHEMATIC_SYMBOL_TYPES } from "../../schematic/schematic-symbols"

const PLACEABLE_TYPES = componentTypeSchema.options.filter(
  (t) => !(BOARD_COMPONENT_TYPES as readonly string[]).includes(t) && t !== "wire",
)

const defByType = new Map(COMPONENT_REGISTRY.map((def) => [def.type, def]))

describe("component completeness — netlist", () => {
  test("every placeable type contributes a netlist stamp (buildNetlist)", () => {
    // The netlist builder silently skips defs without buildNetlist — a
    // component dropped from the electrical sim would just go dark.
    const missing = PLACEABLE_TYPES.filter(
      (t) => typeof defByType.get(t)?.buildNetlist !== "function",
    )
    expect(missing).toEqual([])
  })
})

describe("component completeness — named pins", () => {
  // Types with intentionally no named pins:
  //   ic          — generic DIP, pins depend on the part
  //   ir_remote   — virtual input device, never wired
  //   multimeter  — probes come from properties, not fixed pins
  //   power_supply— rail terminals are resolved positionally
  const KNOWN_UNNAMED = ["ic", "ir_remote", "multimeter", "power_supply"].sort()

  test("every other placeable type resolves named pins", () => {
    const unnamed: string[] = PLACEABLE_TYPES.filter(
      (t) => getComponentPinNames(t).length === 0,
    ).sort()
    // Exact equality: a NEW type without pin names must either get names or
    // be added to KNOWN_UNNAMED here, deliberately.
    expect(unnamed).toEqual(KNOWN_UNNAMED)
  })
})

describe("component completeness — schematic symbols", () => {
  // Types that intentionally render as the generic module box today.
  // (shift_register / lcd_16x2 / seven_segment route through the multi-pin
  // ic_pin path in schematic-layout, so a dedicated symbol is optional.)
  const KNOWN_GENERIC = [
    "dht_sensor",
    "ic",
    "ir_receiver",
    "ir_remote",
    "multimeter",
    "oled_display",
    "power_supply",
    "shift_register",
  ].sort()

  test("every other placeable type declares a schematic symbol", () => {
    const generic: string[] = PLACEABLE_TYPES.filter(
      (t) => defByType.get(t)?.schematicSymbol === undefined,
    ).sort()
    expect(generic).toEqual(KNOWN_GENERIC)
  })

  test("every declared schematicSymbol is a real symbol type", () => {
    const valid = new Set<string>(SCHEMATIC_SYMBOL_TYPES)
    const bogus = COMPONENT_REGISTRY.filter(
      (def) => def.schematicSymbol !== undefined && !valid.has(def.schematicSymbol),
    ).map((def) => `${def.type} → ${String(def.schematicSymbol)}`)
    expect(bogus).toEqual([])
  })
})

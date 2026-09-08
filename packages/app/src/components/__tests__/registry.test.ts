import { describe, expect, test } from "bun:test"
import { BOARD_COMPONENT_TYPES, componentTypeSchema } from "@dreamer/schemas"
import { COMPONENT_REGISTRY, getComponentSpec } from "../registry"

const schemaTypes = new Set<string>(componentTypeSchema.options)
const registryTypes = new Set(COMPONENT_REGISTRY.map((def) => def.type))
const schemaOnlyTypes = new Set<string>([...BOARD_COMPONENT_TYPES, "wire"])

describe("component registry consistency", () => {
  test("every registry component type is accepted by the shared schema", () => {
    const unknownTypes = [...registryTypes].filter((type) => !schemaTypes.has(type))
    expect(unknownTypes).toEqual([])
  })

  test("every placeable schema component has a registry definition", () => {
    const missingDefinitions = [...schemaTypes]
      .filter((type) => !schemaOnlyTypes.has(type))
      .filter((type) => !registryTypes.has(type))

    expect(missingDefinitions).toEqual([])
  })

  test("registry types are unique", () => {
    expect(registryTypes.size).toBe(COMPONENT_REGISTRY.length)
  })

  test("every built-in has a renderer-free core spec", () => {
    const missing = COMPONENT_REGISTRY
      .filter((def) => getComponentSpec(def.type) === undefined)
      .map((def) => def.type)
    expect(missing).toEqual([])
  })

  test("core specs keep pins and capabilities local to the catalog", () => {
    const stepper = getComponentSpec("stepper_motor")
    expect(stepper?.pinNames).toEqual(["in1", "in2", "in3", "in4", "vplus", "gnd"])
    expect(stepper?.capabilities).toContain("breadboard-2d")
    expect(stepper?.capabilities).toContain("sketch")
  })
})

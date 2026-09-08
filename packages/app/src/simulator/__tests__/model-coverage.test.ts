import { describe, expect, test } from "bun:test"
import { COMPONENT_REGISTRY } from "@/components/catalog/manager"
import { isBoardComponentType } from "@dreamer/schemas"
import { describeModelCoverage } from "../model-coverage"

describe("SPICE model coverage matrix", () => {
  test("every catalog definition has an explicit coverage classification", () => {
    const rows = COMPONENT_REGISTRY
      .filter((definition) => !isBoardComponentType(definition.type) && definition.type !== "wire")
      .map((definition) => ({
        type: definition.type,
        coverage: describeModelCoverage(definition.type, Boolean(definition.buildNetlist)),
      }))

    expect(rows.length).toBeGreaterThan(10)
    expect(rows.every(({ coverage }) => ["supported", "approximate", "unsupported"].includes(coverage.classification))).toBe(true)
    expect(rows.filter(({ coverage }) => coverage.classification === "unsupported").every(({ coverage }) => typeof coverage.reason === "string")).toBe(true)
    expect(rows.find(({ type }) => type === "servo")?.coverage.classification).toBe("approximate")
  })

  test("unsupported coverage names the missing model instead of silently falling back", () => {
    expect(describeModelCoverage("future_sensor", false)).toEqual({
      classification: "unsupported",
      reason: "No SPICE netlist model is registered for future_sensor",
    })
  })
})

import { expect, test } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { powerSupply } from "../power-supply"
import type { NetlistContext } from "@/components/component-definition"

test("MB102 publishes both regulated outputs as solved supplies", () => {
  const component: BoardComponent = {
    id: "psu-1", type: "power_supply", name: "PSU", x: 0, y: 0, rotation: 0,
    pins: {}, properties: { leftVoltage: 5, rightVoltage: 3.3 },
  }
  const footprint = powerSupply.footprint(0, 0, component.properties)
  const ctx: NetlistContext = {
    footprint,
    resolveNode: (point) => `n_${point.row}_${point.col}`,
    pinStates: [], wires: {}, mode: "op",
  }
  const result = powerSupply.buildNetlist?.(component, ctx)

  expect(result?.supplySources).toEqual([
    expect.objectContaining({ id: "psu-1:left", nominalVoltage: 5, currentLimitMa: 700 }),
    expect.objectContaining({ id: "psu-1:right", nominalVoltage: 3.3, currentLimitMa: 700 }),
  ])
  // Each channel names its own − rail. A device grounded there is genuinely
  // grounded even though the node is never SPICE "0" (the MB102 ties its −
  // rails to 0 through a 1Ω resistor).
  const [left, right] = result?.supplySources ?? []
  expect(left?.returnNode).toBeDefined()
  expect(right?.returnNode).toBeDefined()
  expect(left?.returnNode).not.toBe("0")
  expect(left?.returnNode).not.toBe(right?.returnNode)
})

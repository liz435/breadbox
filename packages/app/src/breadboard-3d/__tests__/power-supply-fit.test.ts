import { describe, expect, test } from "bun:test"
import type { BoardComponent } from "@dreamer/schemas"
import { computePinFit, footprintCenter, footprintPinTargets } from "../part-frame"
import { getPinCalibration } from "../component-pin-calibration"
import { applySimilarity2D } from "../similarity-2d"

// The MB102 power module straddles the full board width — its baked pin
// calibration (derived from the GLB's pin-tip vertex clusters) must seat the
// model's pins on the warped rail holes. Regression for the module rendering
// wider than the board (pins overhanging the rails left/right).
describe("power_supply baked pin fit", () => {
  const component = {
    id: "psu-fit-test",
    type: "power_supply",
    name: "PSU",
    x: 0,
    y: 0,
    rotation: 0,
    pins: {},
    properties: {},
  } as unknown as BoardComponent

  test("baked calibration seats the module pins on the rail holes", () => {
    const cal = getPinCalibration("power_supply")
    expect(cal).toBeDefined()
    if (!cal) return

    const fit = computePinFit(component, cal)
    expect(fit).not.toBeNull()
    if (!fit) return

    // The fit stretches the model by the grid's model↔mm scale (the imported
    // breadboard model is ~1.23× real size) — never runs away past that
    // (crossed rail targets once forced it there), never collapses.
    expect(fit.scale).toBeGreaterThan(1.1)
    expect(fit.scale).toBeLessThan(1.35)
    // No accidental flip: the pin ordering matches the footprint's.
    expect(Math.abs(fit.rotation)).toBeLessThan(0.05)

    // Every calibrated pin lands within a hole radius (~1.25mm) of its warped
    // rail target. The footprint rows are a rail block's 1st and 5th holes —
    // the same 4-hole gap as the model's pin rows — so both axes must fit.
    const center = footprintCenter(component)
    const targets = footprintPinTargets(component)
    expect(targets.length).toBe(cal.pins.length)
    cal.pins.forEach((pin, i) => {
      const applied = applySimilarity2D(fit, pin)
      const target = { x: targets[i].x - center.x, z: targets[i].z - center.z }
      expect(Math.abs(applied.x - target.x)).toBeLessThan(1.25)
      expect(Math.abs(applied.z - target.z)).toBeLessThan(1.25)
    })
  })
})

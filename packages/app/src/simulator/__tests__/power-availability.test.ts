import { expect, test } from "bun:test"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import type { PartPowerModel } from "@/components/part-spec"
import { isComponentPowered } from "../power-availability"

const sensor: BoardComponent = {
  id: "tmp", type: "temperature_sensor", name: "TMP36", x: 0, y: 4,
  rotation: 0, pins: {}, properties: {},
}

const motor: BoardComponent = {
  id: "motor", type: "dc_motor", name: "Motor", x: 0, y: 4,
  rotation: 0, pins: {}, properties: {},
}

const WITH_RETURN: PartPowerModel = {
  supply: ["vcc", "power"], return: ["gnd", "ground"], minOperatingVolts: 2.7,
}
const SUPPLY_ONLY: PartPowerModel = { supply: ["vcc"], minOperatingVolts: 4.0 }

const source = (id: string, pin: number, row: number): Wire => ({
  id, fromRow: -999, fromCol: pin, toRow: row, toCol: 0, color: "#000",
})

test("a part declaring a return needs both a resolved supply and ground", () => {
  expect(isComponentPowered(sensor, { tmp: sensor }, {
    vcc: source("vcc", -1, 4), gnd: source("gnd", -3, 6),
  }, WITH_RETURN)).toBe(true)
  expect(isComponentPowered(sensor, { tmp: sensor }, {
    vcc: source("vcc", -1, 4),
  }, WITH_RETURN)).toBe(false)
})

// The motor returns through its driver pin, so demanding a ground net it does
// not have would report it dead on a correctly wired board.
test("a part with no declared return is judged on its supply pin alone", () => {
  expect(isComponentPowered(motor, { motor }, {
    vcc: source("vcc", -1, 4),
  }, SUPPLY_ONLY)).toBe(true)
})

test("a part with no declared model is never claimed as powered", () => {
  expect(isComponentPowered(sensor, { tmp: sensor }, {
    vcc: source("vcc", -1, 4), gnd: source("gnd", -3, 6),
  }, undefined)).toBe(false)
})

import { describe, expect, test } from "bun:test"
import exampleBoard from "../boards/ex-servo.json"
import learnBoard from "../../learn/boards/10-servo.json"
import {
  powerSupplyPinRows,
  PSU_BODY_OVERHANG_BOTTOM_ROWS,
  PSU_BODY_OVERHANG_TOP_ROWS,
} from "@/components/catalog/power-supply/pin-rows"

type ServoBoardLayout = {
  components: Record<string, { type: string; y: number }>
  wires: Record<string, { toCol: number; toRow: number }>
}

function expectGroundBelowPowerModule(board: ServoBoardLayout) {
  const powerSupply = Object.values(board.components).find(
    (component) => component.type === "power_supply",
  )
  expect(powerSupply).toBeDefined()

  const ground = board.wires["wire-common-gnd"]
  expect(ground).toBeDefined()
  expect(ground.toCol).toBe(10)

  const [topPinRow, bottomPinRow] = powerSupplyPinRows(powerSupply!.y)
  const bodyTopRow = topPinRow - PSU_BODY_OVERHANG_TOP_ROWS
  const bodyBottomRow = bottomPinRow + PSU_BODY_OVERHANG_BOTTOM_ROWS

  // The endpoint stays on the negative rail, but must be below the module's
  // physical body. This prevents the black Arduino-GND jumper from ending
  // inside the MB102 model in the 3D scene.
  expect(ground.toRow).toBeGreaterThan(bodyBottomRow)
  expect(ground.toRow).toBe(14)
  expect(ground.toRow).toBeGreaterThanOrEqual(bodyTopRow)
}

describe("servo example ground routing", () => {
  test("the example ground plug is below the power module", () => {
    expectGroundBelowPowerModule(exampleBoard)
  })

  test("the servo lesson uses the same clear physical landing", () => {
    expectGroundBelowPowerModule(learnBoard)
  })
})

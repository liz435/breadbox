// ── Power gate under the strict realism profiles ────────────────────────
//
// The rest of the headless suite runs in Learn, where the power gate is off.
// That gap is not academic: a DC motor that could never report itself powered
// was force-stopped on every solved frame in Electrical/Hardware and the whole
// suite still passed. These tests run real boards through the gate.

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { boardStateSchema, type BoardState, type RealismProfile } from "@dreamer/schemas"
import { runBoardHeadless } from "./headless-run"

const EXAMPLES_DIR = join(import.meta.dir, "..", "boards")
const LEARN_DIR = join(import.meta.dir, "..", "..", "learn", "boards")

function load(dir: string, key: string): { board: BoardState; hex: string } {
  const board = boardStateSchema.parse(
    JSON.parse(readFileSync(join(dir, `${key}.json`), "utf8")),
  )
  const fixture = JSON.parse(
    readFileSync(join(dir, "fixtures", `${key}.hex.json`), "utf8"),
  ) as { hex: string }
  return { board, hex: fixture.hex }
}

const MOTOR_BOARDS = [
  { name: "ex-dc-motor", dir: EXAMPLES_DIR },
  { name: "19-dc-motor", dir: LEARN_DIR },
] as const

describe("DC motor spins under every realism profile", () => {
  for (const { name, dir } of MOTOR_BOARDS) {
    for (const profile of ["learn", "electrical", "hardware"] as RealismProfile[]) {
      test(`${name} — ${profile}`, () => {
        const { board, hex } = load(dir, name)
        const result = runBoardHeadless(board, hex, 800, { realismProfile: profile })
        expect(result.runtimeErrors).toEqual([])
        // The regression: the gate must not hold the rotor at zero on a board
        // whose supply is wired correctly.
        expect(result.observations.dcMotorMaxSpeed).toBeGreaterThan(0)
      })
    }
  }
})

describe("the gate still reacts to wiring", () => {
  // Cutting the motor's supply wires must stop it — otherwise "it spins" above
  // would prove nothing more than that the gate is inert.
  test("a motor with no supply wiring never spins in hardware mode", () => {
    const { board, hex } = load(EXAMPLES_DIR, "ex-dc-motor")
    const motor = Object.values(board.components).find((c) => c.type === "dc_motor")
    expect(motor).toBeDefined()
    const stripped: BoardState = { ...board, components: { ...board.components } }
    for (const id of Object.keys(stripped.components)) {
      if (stripped.components[id].type === "power_supply") delete stripped.components[id]
    }
    stripped.wires = {}

    const result = runBoardHeadless(stripped, hex, 800, { realismProfile: "hardware" })
    expect(result.observations.dcMotorMaxSpeed).toBe(0)
  })
})

// ── Example + learn board static checks ─────────────────────────────────
//
// Glob-driven over BOTH board directories: every board JSON — present and
// future — gets schema validation and electrical analysis (missing common
// grounds, wrong PSU rail, unpowered peripherals, …) with no list to keep
// in sync. Also guards the EXAMPLE_META ↔ board-file bijection so an
// orphaned meta entry or an unlisted board can't slip through silently.

import { describe, expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { EXAMPLE_META } from "../example-meta"
import { analyzeExampleBoard, loadExampleBoard } from "./test-utils"

const EXAMPLES_DIR = join(import.meta.dir, "..", "boards")
const LEARN_DIR = join(import.meta.dir, "..", "..", "learn", "boards")

function listBoardFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
}

for (const [name, dir] of [
  ["examples", EXAMPLES_DIR],
  ["learn", LEARN_DIR],
] as const) {
  describe(`${name} boards — electrical cleanliness`, () => {
    for (const fileName of listBoardFiles(dir)) {
      test(`${fileName} — valid schema, no electrical errors`, () => {
        const board = loadExampleBoard(join(dir, fileName))
        const result = analyzeExampleBoard(board)
        if (result.hasElectricalErrors) {
          const msg = result.electricalErrors.join("\n  ")
          throw new Error(`${fileName}: electrical errors:\n  ${msg}`)
        }
        expect(result.hasElectricalErrors).toBe(false)
      })
    }
  })
}

describe("EXAMPLE_META ↔ board files", () => {
  const fileKeys = listBoardFiles(EXAMPLES_DIR).map((f) => basename(f, ".json"))
  const metaKeys = Object.keys(EXAMPLE_META)

  test("every board file has a meta entry (else it never shows in the catalog)", () => {
    const missing = fileKeys.filter((k) => !metaKeys.includes(k))
    expect(missing).toEqual([])
  })

  test("every meta entry has a board file (else it's dead metadata)", () => {
    const orphaned = metaKeys.filter((k) => !fileKeys.includes(k))
    expect(orphaned).toEqual([])
  })
})

import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { boardStateSchema } from "@dreamer/schemas"
import { transpile } from "../../simulator/arduino-transpiler"

const BOARDS_DIR = join(import.meta.dir, "..", "boards")

function listExampleBoardFiles(): string[] {
  return readdirSync(BOARDS_DIR)
    .filter((name) => /^ex-.*\.json$/.test(name))
    .sort()
}

describe("example board sketches", () => {
  for (const fileName of listExampleBoardFiles()) {
    test(`${fileName} transpiles without errors`, () => {
      const filePath = join(BOARDS_DIR, fileName)
      const rawJson = JSON.parse(readFileSync(filePath, "utf8")) as unknown
      const parsed = boardStateSchema.safeParse(rawJson)

      expect(parsed.success).toBe(true)
      if (!parsed.success) {
        throw new Error(`${fileName}: invalid BoardState JSON`)
      }

      const boardState = parsed.data
      const sketchCode = boardState.sketchCode.trim()
      expect(sketchCode.length).toBeGreaterThan(0)

      const customLibraries = Object.fromEntries(
        Object.entries(boardState.customLibraries).map(([headerName, lib]) => [headerName, lib.code]),
      )

      const result = transpile(sketchCode, customLibraries)
      if (!result.success) {
        throw new Error(
          `${fileName}: line ${result.error?.line ?? "?"} — ${result.error?.message ?? "unknown transpile error"}`,
        )
      }

      expect(result.code.trim().length).toBeGreaterThan(0)
    })
  }
})

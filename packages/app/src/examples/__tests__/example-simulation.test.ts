// ── Example + learn board headless simulation ──────────────────────────
//
// Every board with a sketch — examples AND learn boards — is executed on
// the full app stack (AVR emulator + pin store + peripheral bus) from its
// committed hex fixture, then checked against its ExpectedBehavior.
//
// Coverage is glob-driven: a new board JSON is picked up automatically,
// and the suite FAILS (not skips) when its fixture or behavior entry is
// missing — silent gaps are exactly what this suite exists to prevent.
//
// Regenerate fixtures after changing any sketch:
//   bun run dev:api          (in another terminal)
//   bun run examples:compile

import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"

import { boardStateSchema, type BoardState } from "@dreamer/schemas"
import { EXAMPLE_META, type ExpectedBehavior } from "../example-meta"
import { LEARN_BOARD_BEHAVIOR } from "../../learn/board-behavior"
import { evaluateExpectedBehavior, runBoardHeadless } from "./headless-run"

const DEFAULT_SIMULATE_MS = 400

type BoardSuite = {
  name: string
  boardsDir: string
  behaviorFor: (key: string) => ExpectedBehavior | undefined
}

const SUITES: BoardSuite[] = [
  {
    name: "examples",
    boardsDir: join(import.meta.dir, "..", "boards"),
    behaviorFor: (key) => EXAMPLE_META[key]?.expectedBehavior,
  },
  {
    name: "learn",
    boardsDir: join(import.meta.dir, "..", "..", "learn", "boards"),
    behaviorFor: (key) => LEARN_BOARD_BEHAVIOR[key],
  },
]

type FixtureFile = {
  sketchHash: string
  hex: string
  generatedAt: string
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex")
}

function listBoardKeys(boardsDir: string): string[] {
  return readdirSync(boardsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => basename(f, ".json"))
    .sort()
}

function loadBoard(boardsDir: string, key: string): BoardState {
  const raw = JSON.parse(readFileSync(join(boardsDir, `${key}.json`), "utf8")) as unknown
  const parsed = boardStateSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`${key}.json: invalid BoardState JSON — ${parsed.error.message}`)
  }
  return parsed.data
}

for (const suite of SUITES) {
  const keys = listBoardKeys(suite.boardsDir)

  describe(`${suite.name} — headless simulation`, () => {
    for (const key of keys) {
      const board = loadBoard(suite.boardsDir, key)
      if (!board.sketchCode.trim()) continue

      test(`${key} — sketch runs and meets expected behavior`, () => {
        const behavior = suite.behaviorFor(key)
        if (!behavior) {
          throw new Error(
            `${key} has a sketch but no ExpectedBehavior entry. Add one ` +
              (suite.name === "examples"
                ? `to EXAMPLE_META["${key}"].expectedBehavior in examples/example-meta.ts`
                : `to LEARN_BOARD_BEHAVIOR["${key}"] in learn/board-behavior.ts`) +
              ` (an empty {} is a valid runs-without-errors smoke check).`,
          )
        }

        const fixturePath = join(suite.boardsDir, "fixtures", `${key}.hex.json`)
        if (!existsSync(fixturePath)) {
          throw new Error(
            `${key}: missing hex fixture at fixtures/${key}.hex.json. ` +
              `Run 'bun run examples:compile' (API server must be running) and commit the result.`,
          )
        }
        const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as FixtureFile
        const currentHash = sha256(board.sketchCode)
        if (fixture.sketchHash !== currentHash) {
          throw new Error(
            `${key}: fixture is stale (sketch changed since last compile).\n` +
              `  fixture hash: ${fixture.sketchHash.slice(0, 12)}…\n` +
              `  current hash: ${currentHash.slice(0, 12)}…\n` +
              `  Run: bun run examples:compile`,
          )
        }

        const simulateMs = behavior.simulateMs ?? DEFAULT_SIMULATE_MS
        const result = runBoardHeadless(board, fixture.hex, simulateMs)

        const failures = [
          ...result.runtimeErrors.map((e) => `runtime error: ${e}`),
          ...evaluateExpectedBehavior(behavior, result),
        ]
        if (failures.length > 0) {
          throw new Error(
            `${key} (ran ${simulateMs}ms):\n  - ${failures.join("\n  - ")}\n` +
              `  serial output: ${JSON.stringify(result.serial.slice(0, 200))}`,
          )
        }
        expect(failures).toEqual([])
      })
    }
  })
}

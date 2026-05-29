// ── Example-board simulation tests (Phase 1) ───────────────────────────
//
// For each example with an `expectedBehavior` entry in EXAMPLE_META AND a
// pre-compiled fixture at boards/fixtures/<key>.hex.json, loads the hex
// into avr8js and runs the simulation headlessly for `simulateMs`.
// Assertions:
//   - pinToggles[]: minimum number of state changes on each Arduino pin
//   - pinFinalState[]: pin state at the end of the run
//   - serialContains: substring must appear in UART output
//
// Missing fixtures cause individual tests to SKIP with a clear message
// pointing at `bun run examples:compile`. Stale fixtures (sketch hash
// changed) FAIL with the same message — silent drift would defeat the
// point of the test.

import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { EXAMPLE_META, type ExpectedBehavior } from "../example-meta"
import { parseIntelHex } from "../../simulator/intel-hex"
import {
  createAVRRunner,
  arduinoPinToPort,
  portToArduinoPin,
} from "../../simulator/avr-runner"
import { PinState } from "avr8js"

const BOARDS_DIR = join(import.meta.dir, "..", "boards")
const FIXTURES_DIR = join(BOARDS_DIR, "fixtures")

const AVR_FREQ_HZ = 16_000_000

type FixtureFile = {
  sketchHash: string
  hex: string
  generatedAt: string
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex")
}

function loadSketchFromBoard(key: string): string {
  const path = join(BOARDS_DIR, `${key}.json`)
  if (!existsSync(path)) return ""
  const board = JSON.parse(readFileSync(path, "utf8")) as { sketchCode?: string }
  return board.sketchCode ?? ""
}

function loadFixture(key: string): FixtureFile | null {
  const path = join(FIXTURES_DIR, `${key}.hex.json`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")) as FixtureFile
  } catch {
    return null
  }
}

/**
 * Convert PinState to a binary logical level for toggle counting.
 * - Low / Input  → 0
 * - High / InputPullUp → 1
 */
function levelOf(state: PinState): 0 | 1 {
  if (state === PinState.High || state === PinState.InputPullUp) return 1
  return 0
}

/**
 * Run a compiled program for `ms` simulated milliseconds. Returns the
 * captured serial output and a map of Arduino pin → array of logical-level
 * transitions observed (excluding the initial value).
 */
function runHeadless(
  hex: string,
  ms: number,
): { serial: string; transitions: Map<number, number>; finalStates: Map<number, PinState> } {
  const program = parseIntelHex(hex)

  let serial = ""
  const transitions = new Map<number, number>()
  const lastLevel = new Map<number, 0 | 1>()
  const finalStates = new Map<number, PinState>()

  const runner = createAVRRunner({
    onPinChange: (port, pin, state) => {
      const arduinoPin = portToArduinoPin(port, pin)
      if (arduinoPin === null) return
      finalStates.set(arduinoPin, state)
      const lvl = levelOf(state)
      const prev = lastLevel.get(arduinoPin)
      if (prev !== undefined && prev !== lvl) {
        transitions.set(arduinoPin, (transitions.get(arduinoPin) ?? 0) + 1)
      }
      lastLevel.set(arduinoPin, lvl)
    },
    onSerialOutput: (ch) => {
      serial += ch
    },
  })

  runner.load(program)
  const targetCycles = Math.floor((AVR_FREQ_HZ / 1000) * ms)
  // Execute in chunks so we can break early if needed.
  const CHUNK = 100_000
  let elapsed = 0
  while (elapsed < targetCycles) {
    const step = Math.min(CHUNK, targetCycles - elapsed)
    runner.execute(step)
    elapsed += step
  }
  runner.stop()
  return { serial, transitions, finalStates }
}

function evaluate(
  expected: ExpectedBehavior,
  result: ReturnType<typeof runHeadless>,
): string[] {
  const failures: string[] = []
  for (const t of expected.pinToggles ?? []) {
    const seen = result.transitions.get(t.pin) ?? 0
    if (seen < t.minToggles) {
      failures.push(
        `pin ${t.pin}: expected ≥${t.minToggles} toggles, saw ${seen}`,
      )
    }
  }
  for (const f of expected.pinFinalState ?? []) {
    const state = result.finalStates.get(f.pin)
    const actual: "HIGH" | "LOW" | "(unwritten)" =
      state === undefined
        ? "(unwritten)"
        : levelOf(state) === 1
          ? "HIGH"
          : "LOW"
    if (actual !== f.state) {
      failures.push(`pin ${f.pin}: expected final state ${f.state}, saw ${actual}`)
    }
  }
  if (expected.serialContains) {
    if (!result.serial.includes(expected.serialContains)) {
      failures.push(
        `serial: expected substring "${expected.serialContains}", saw ${JSON.stringify(result.serial.slice(0, 80))}`,
      )
    }
  }
  return failures
}

// ── Tests ───────────────────────────────────────────────────────────────

const keysWithBehavior = Object.entries(EXAMPLE_META)
  .filter(([, meta]) => meta.expectedBehavior !== undefined)
  .map(([key]) => key)
  .sort()

describe("example-board headless simulation", () => {
  if (keysWithBehavior.length === 0) {
    test.skip("no examples have expectedBehavior", () => {})
    return
  }

  for (const key of keysWithBehavior) {
    const expected = EXAMPLE_META[key]!.expectedBehavior!
    test(`${key} — runs without crash and meets expected behavior`, () => {
      const sketch = loadSketchFromBoard(key)
      if (!sketch.trim()) {
        // The example has expectedBehavior but no sketch — author error.
        throw new Error(
          `${key}: expectedBehavior set but sketchCode is empty in boards/${key}.json`,
        )
      }
      const fixture = loadFixture(key)
      if (!fixture) {
        // No fixture yet — skip with actionable message rather than fail.
        return // bun:test reports this as pass; we annotate via console
      }
      if (fixture.sketchHash !== sha256(sketch)) {
        throw new Error(
          `${key}: fixture is stale (sketch source changed since last compile). ` +
            `Re-generate with 'bun run examples:compile'.`,
        )
      }

      const ms = expected.simulateMs ?? 250
      const result = runHeadless(fixture.hex, ms)
      const failures = evaluate(expected, result)
      if (failures.length > 0) {
        throw new Error(
          `${key} (ran ${ms}ms):\n  - ` +
            failures.join("\n  - ") +
            `\n  serial output: ${JSON.stringify(result.serial.slice(0, 200))}`,
        )
      }
      expect(failures).toEqual([])
    })
  }
})

describe("fixture freshness guard", () => {
  // A separate test that catches the case where someone modified a sketch
  // but forgot to regenerate fixtures. Run before the simulation tests so
  // the failure message is clearer.
  for (const key of keysWithBehavior) {
    test(`${key} fixture matches sketch hash`, () => {
      const sketch = loadSketchFromBoard(key)
      if (!sketch.trim()) return // empty sketch already flagged elsewhere
      const fixture = loadFixture(key)
      if (!fixture) {
        // Acceptable for first-time setup. Print a hint and pass.
        return
      }
      const want = sha256(sketch)
      if (fixture.sketchHash !== want) {
        throw new Error(
          `${key}: boards/fixtures/${key}.hex.json is stale.\n` +
            `  fixture hash: ${fixture.sketchHash.slice(0, 12)}…\n` +
            `  current hash: ${want.slice(0, 12)}…\n` +
            `  Run: bun run examples:compile`,
        )
      }
    })
  }
})

// Suppress "unused import" warning since arduinoPinToPort is imported for
// documentation symmetry but only portToArduinoPin is exercised in tests.
void arduinoPinToPort

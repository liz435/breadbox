// ── Example-board test harness ─────────────────────────────────────────────
//
// Post-transpile-drop, behavior tests that run a sketch require arduino-cli
// + a compile step. Those can land as follow-up work that caches compiled
// hex per sketch hash; for now we expose only the transpile-independent
// electrical analysis.

import { readFileSync } from "node:fs"
import { basename, isAbsolute, join } from "node:path"
import { boardStateSchema, type BoardState } from "@dreamer/schemas"
import { analyzeElectricalBoard } from "../../electrical/power-budget"

const BOARDS_DIR = join(import.meta.dir, "..", "boards")

/** Load + schema-validate a board JSON (bare name ⇒ examples/boards). */
export function loadExampleBoard(fileNameOrPath: string): BoardState {
  const filePath = isAbsolute(fileNameOrPath)
    ? fileNameOrPath
    : join(BOARDS_DIR, fileNameOrPath)
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown
  const parsed = boardStateSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`${basename(filePath)}: invalid BoardState JSON — ${parsed.error.message}`)
  }
  return parsed.data
}

export type AnalyzeResult = {
  hasElectricalErrors: boolean
  electricalErrors: string[]
  electricalWarnings: string[]
}

/**
 * Pure electrical analysis — no VM, no sketch execution. Suitable for CI
 * without arduino-cli.
 */
export function analyzeExampleBoard(board: BoardState): AnalyzeResult {
  const report = analyzeElectricalBoard(board)
  return {
    hasElectricalErrors: report.hasErrors,
    electricalErrors: report.issues
      .filter((i) => i.severity === "error")
      .map((i) => i.message),
    electricalWarnings: report.issues
      .filter((i) => i.severity === "warning")
      .map((i) => i.message),
  }
}

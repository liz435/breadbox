// ── compile-examples.ts ─────────────────────────────────────────────────
//
// Pre-compiles each example sketch (those with `expectedBehavior` in
// EXAMPLE_META) via the local API server and saves the Intel-HEX output
// to `packages/app/src/examples/boards/fixtures/<key>.hex.json`. The
// resulting fixtures are committed so `examples-simulation.test.ts` can
// load and run them headlessly without arduino-cli in CI.
//
// Workflow:
//   1. `bun run dev:api`           ← in another terminal, must be running
//   2. `bun run examples:compile`  ← writes/updates fixtures
//   3. Commit the new/updated fixture JSON files
//
// The script skips examples whose sketch hash matches the existing
// fixture, so re-running is a no-op when nothing changed.

import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { EXAMPLE_META } from "../packages/app/src/examples/example-meta"

const API_BASE = process.env.DREAMER_API_BASE ?? "http://localhost:4111"
const BOARDS_DIR = join(import.meta.dir, "..", "packages", "app", "src", "examples", "boards")
const FIXTURES_DIR = join(BOARDS_DIR, "fixtures")

type FixtureFile = {
  /** sha256 of the sketch source — used to detect drift. */
  sketchHash: string
  /** Intel HEX text. Parsed via parseIntelHex at test time. */
  hex: string
  /** ISO timestamp of when this fixture was generated. */
  generatedAt: string
  /** Size info from arduino-cli, for sanity. */
  sizeInfo?: unknown
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

function keysWithBehavior(): string[] {
  return Object.entries(EXAMPLE_META)
    .filter(([, meta]) => meta.expectedBehavior !== undefined)
    .map(([key]) => key)
    .sort()
}

type ApiCompileResponse =
  | { kind: "log"; line: string; stream: "stdout" | "stderr" }
  | { kind: "done"; format: "hex" | "uf2"; data: string; sizeInfo?: unknown }
  | { kind: "error"; message: string }
  | { kind: string; [k: string]: unknown }

async function compileViaApi(
  sketchCode: string,
): Promise<{ hex: string; sizeInfo?: unknown }> {
  const url = `${API_BASE}/api/compile`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // CLI auth mode needs an Origin from the allowlist. localhost API
      // origin works for loopback scripts.
      origin: API_BASE,
    },
    body: JSON.stringify({ code: sketchCode }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`POST /api/compile → ${res.status}: ${text.slice(0, 200)}`)
  }
  if (!res.body) throw new Error("/api/compile returned no body")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let hex: string | undefined
  let sizeInfo: unknown
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      let msg: ApiCompileResponse
      try {
        msg = JSON.parse(line) as ApiCompileResponse
      } catch {
        continue
      }
      if (msg.kind === "done" && (msg as { format?: string }).format === "hex") {
        const data = (msg as { data?: unknown }).data
        if (typeof data === "string") hex = data
        sizeInfo = (msg as { sizeInfo?: unknown }).sizeInfo
      } else if (msg.kind === "error") {
        throw new Error(`/api/compile error: ${(msg as { message?: string }).message}`)
      }
    }
  }
  if (!hex) throw new Error("/api/compile finished without emitting a hex 'done' event")
  return { hex, sizeInfo }
}

async function main() {
  // Pre-flight: ensure API server is reachable.
  try {
    const probe = await fetch(`${API_BASE}/api/capabilities`, {
      headers: { origin: API_BASE },
    })
    if (!probe.ok) {
      throw new Error(`probe returned ${probe.status}`)
    }
  } catch (err) {
    console.error(
      `Cannot reach API server at ${API_BASE}. Start it with 'bun run dev:api' in another terminal.`,
    )
    console.error(`  ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  mkdirSync(FIXTURES_DIR, { recursive: true })

  const keys = keysWithBehavior()
  if (keys.length === 0) {
    console.error("No examples with expectedBehavior found. Nothing to compile.")
    process.exit(1)
  }

  console.log(`Compiling ${keys.length} example(s) with expectedBehavior:`)

  let compiled = 0
  let skipped = 0
  for (const key of keys) {
    const jsonPath = join(BOARDS_DIR, `${key}.json`)
    if (!existsSync(jsonPath)) {
      console.log(`  ${key}: SKIP (no boards/${key}.json found)`)
      continue
    }
    const board = JSON.parse(readFileSync(jsonPath, "utf8")) as { sketchCode?: string }
    const sketchCode = board.sketchCode ?? ""
    if (!sketchCode.trim()) {
      console.log(`  ${key}: SKIP (empty sketchCode)`)
      continue
    }

    const hash = sha256(sketchCode)
    const fixturePath = join(FIXTURES_DIR, `${key}.hex.json`)

    if (existsSync(fixturePath)) {
      try {
        const existing = JSON.parse(readFileSync(fixturePath, "utf8")) as FixtureFile
        if (existing.sketchHash === hash) {
          console.log(`  ${key}: skip (fixture up to date)`)
          skipped++
          continue
        }
      } catch {
        // fall through and recompile
      }
    }

    console.log(`  ${key}: compiling…`)
    try {
      const { hex, sizeInfo } = await compileViaApi(sketchCode)
      const fixture: FixtureFile = {
        sketchHash: hash,
        hex,
        generatedAt: new Date().toISOString(),
        sizeInfo,
      }
      writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + "\n", "utf8")
      console.log(`  ${key}: ✓ written ${hex.length} chars of Intel HEX`)
      compiled++
    } catch (err) {
      console.error(`  ${key}: FAIL — ${err instanceof Error ? err.message : String(err)}`)
      process.exitCode = 1
    }
  }

  // Stale-fixture check: remove fixtures whose example no longer has
  // expectedBehavior (so we don't accumulate dead files).
  const wantedSet = new Set(keys.map((k) => `${k}.hex.json`))
  const stale: string[] = []
  for (const file of readdirSync(FIXTURES_DIR)) {
    if (!file.endsWith(".hex.json")) continue
    if (!wantedSet.has(file)) stale.push(file)
  }
  if (stale.length > 0) {
    console.log(`Stale fixtures (no matching expectedBehavior — consider removing):`)
    for (const f of stale) console.log(`  ${f}`)
  }

  console.log(`Done. ${compiled} compiled, ${skipped} skipped.`)
}

await main()

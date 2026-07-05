// ── compile-examples.ts ─────────────────────────────────────────────────
//
// Pre-compiles every example/learn board sketch via the local API server
// and saves the Intel-HEX output to `<boardsDir>/fixtures/<key>.hex.json`.
// The resulting fixtures are committed so the headless simulation suites
// can load and run every sketch without arduino-cli in CI.
//
// Workflow:
//   1. `bun run dev:api`           ← in another terminal, must be running
//   2. `bun run examples:compile`  ← writes/updates fixtures
//   3. Commit the new/updated fixture JSON files
//
// The script skips boards whose sketch hash matches the existing fixture,
// so re-running is a no-op when nothing changed.

import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs"
import { join, basename } from "node:path"

const API_BASE = process.env.BREADBOX_API_BASE ?? "http://localhost:4111"
const APP_SRC = join(import.meta.dir, "..", "packages", "app", "src")

/** Every directory whose *.json files are BoardStates with a sketch. */
const BOARDS_DIRS = [
  join(APP_SRC, "examples", "boards"),
  join(APP_SRC, "learn", "boards"),
]

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

type ApiCompileResponse =
  | { kind: "log"; line: string; stream: "stdout" | "stderr" }
  | { kind: "done"; format: "hex" | "uf2"; data: string; sizeInfo?: unknown }
  | { kind: "error"; message: string }
  | { kind: string; [k: string]: unknown }

async function compileViaApi(
  sketchCode: string,
): Promise<{ hex: string; sizeInfo?: unknown }> {
  const url = `${API_BASE}/api/compile`
  let res: Response
  // The compile route rate-limits bursts (429 + retryAfterSec). Honor the
  // backoff instead of failing the batch — this script fires dozens of
  // compiles back-to-back.
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // CLI auth mode needs an Origin from the allowlist. localhost API
        // origin works for loopback scripts.
        origin: API_BASE,
      },
      body: JSON.stringify({ code: sketchCode }),
    })
    if (res.status !== 429) break
    if (attempt >= 20) break
    const body = (await res.json().catch(() => null)) as { retryAfterSec?: number } | null
    const waitSec = Math.max(1, body?.retryAfterSec ?? 1)
    await new Promise((resolve) => setTimeout(resolve, waitSec * 1000))
  }
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

  let compiled = 0
  let skipped = 0
  for (const boardsDir of BOARDS_DIRS) {
    const fixturesDir = join(boardsDir, "fixtures")
    mkdirSync(fixturesDir, { recursive: true })

    const keys = readdirSync(boardsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => basename(f, ".json"))
      .sort()

    console.log(`${boardsDir}: ${keys.length} board(s)`)

    const wantedSet = new Set<string>()
    for (const key of keys) {
      const board = JSON.parse(
        readFileSync(join(boardsDir, `${key}.json`), "utf8"),
      ) as { sketchCode?: string }
      const sketchCode = board.sketchCode ?? ""
      if (!sketchCode.trim()) {
        console.log(`  ${key}: SKIP (empty sketchCode)`)
        continue
      }
      wantedSet.add(`${key}.hex.json`)

      const hash = sha256(sketchCode)
      const fixturePath = join(fixturesDir, `${key}.hex.json`)

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

    // Stale-fixture check: flag fixtures whose board no longer exists (or
    // lost its sketch) so dead files don't accumulate.
    const stale: string[] = []
    for (const file of readdirSync(fixturesDir)) {
      if (!file.endsWith(".hex.json")) continue
      if (!wantedSet.has(file)) stale.push(file)
    }
    if (stale.length > 0) {
      console.log(`  Stale fixtures (no matching board — consider removing):`)
      for (const f of stale) console.log(`    ${f}`)
    }
  }

  console.log(`Done. ${compiled} compiled, ${skipped} skipped.`)
}

await main()

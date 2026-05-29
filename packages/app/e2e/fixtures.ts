// ── Shared e2e fixtures (Phase 4 debug bundle) ──────────────────────────
//
// Layers a "debug bundle on failure" capability on top of Playwright's
// built-in trace/video/screenshot collection. Each test gets a shared
// `page` whose console + network activity is buffered, and on failure
// the buffer + final DOM snapshot are written to
// `test-results/<test>/debug-bundle.json`.
//
// Playwright's `trace` already captures most of this in a richer form,
// but the trace is a binary .zip — the JSON bundle is grep-friendly and
// survives even when the trace fails to record (rare but it happens).

import { test as base, expect } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

type ConsoleEntry = { type: string; text: string; ts: number }
type NetworkEntry = {
  method: string
  url: string
  status?: number
  durationMs?: number
  failed?: string
  ts: number
}

type DebugBuffer = {
  console: ConsoleEntry[]
  network: NetworkEntry[]
}

export const test = base.extend<{ debug: DebugBuffer }>({
  debug: async ({ page }, use, testInfo) => {
    const buf: DebugBuffer = { console: [], network: [] }

    page.on("console", (msg) => {
      buf.console.push({
        type: msg.type(),
        text: msg.text(),
        ts: Date.now(),
      })
    })
    page.on("pageerror", (err) => {
      buf.console.push({
        type: "pageerror",
        text: `${err.name}: ${err.message}\n${err.stack ?? ""}`,
        ts: Date.now(),
      })
    })

    const requestStarts = new Map<string, number>()
    page.on("request", (req) => {
      requestStarts.set(req.url(), Date.now())
    })
    page.on("response", (resp) => {
      const url = resp.url()
      const started = requestStarts.get(url)
      buf.network.push({
        method: resp.request().method(),
        url,
        status: resp.status(),
        durationMs: started ? Date.now() - started : undefined,
        ts: Date.now(),
      })
    })
    page.on("requestfailed", (req) => {
      buf.network.push({
        method: req.method(),
        url: req.url(),
        failed: req.failure()?.errorText ?? "unknown",
        ts: Date.now(),
      })
    })

    await use(buf)

    // After the test runs, if it failed, dump the bundle + final DOM.
    if (testInfo.status !== testInfo.expectedStatus) {
      const outDir = join(testInfo.outputDir, "debug")
      try {
        await mkdir(outDir, { recursive: true })
        await writeFile(
          join(outDir, "debug-bundle.json"),
          JSON.stringify(
            {
              testTitle: testInfo.title,
              testFile: testInfo.file,
              status: testInfo.status,
              expectedStatus: testInfo.expectedStatus,
              durationMs: testInfo.duration,
              errors: testInfo.errors.map((e) => ({
                message: e.message,
                stack: e.stack,
              })),
              console: buf.console,
              network: buf.network,
            },
            null,
            2,
          ),
          "utf8",
        )
        const dom = await page.content().catch(() => null)
        if (dom) {
          await writeFile(join(outDir, "final-dom.html"), dom, "utf8")
        }
      } catch {
        // best-effort capture; don't fail the test on artifact write errors.
      }
    }
  },
})

export { expect }

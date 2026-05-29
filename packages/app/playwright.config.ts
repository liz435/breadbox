// ── Playwright config — Phase 2 e2e suite ──────────────────────────────
//
// MVP scope: chromium-only, no parallelism (the dev server is single
// shared state), webServer block boots both API + app dev servers when
// they aren't already running. Local devs running `bun run dev` get a
// fast feedback loop without webServer waiting.
//
// CI starts from a clean machine, so webServer DOES boot the servers
// (re-uses the same dev commands).

import { defineConfig, devices } from "@playwright/test"

const APP_PORT = Number(process.env.APP_PORT ?? 3002)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${APP_PORT}`

export default defineConfig({
  testDir: "./e2e",
  // Single worker — these tests share state (one running app instance).
  workers: 1,
  // CI gets 1 retry; local gets none (faster failure feedback).
  retries: process.env.CI ? 1 : 0,
  // Generous test timeout — Vite cold-start + Anthropic mock setup can be slow.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Headless by default. Run with --headed for debugging.
    headless: true,
    // Keep viewport stable so visual regression baselines are reproducible
    // when Phase 3 lands.
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Skip the webServer block when PLAYWRIGHT_REUSE_SERVER=1 — saves ~20s
  // on local runs when the dev server is already up.
  webServer: process.env.PLAYWRIGHT_REUSE_SERVER
    ? undefined
    : {
        command: "cd ../.. && bun run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
      },
})

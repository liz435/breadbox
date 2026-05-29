// ── Phase 3 visual regression tests ─────────────────────────────────────
//
// Snapshot-based smoke tests for the major UI views. Catches "this layout
// drifted" and "the panel now renders blank" type regressions that the
// click-tests in smoke.spec.ts wouldn't notice (those only assert DOM
// presence, not appearance).
//
// Snapshot baselines are committed to `e2e/visual.spec.ts-snapshots/`.
// Playwright shards them per-platform (chromium-darwin.png vs
// chromium-linux.png), so CI runs on Linux generate their own set. The
// `maxDiffPixelRatio: 0.05` tolerance absorbs small font/antialiasing
// differences without letting real layout breaks slide.
//
// Workflow when a snapshot "fails":
//   1. View the diff under `playwright-report/` or `test-results/`.
//   2. If the change is intentional, regenerate:
//        bun run --cwd packages/app test:e2e -- --update-snapshots
//   3. Commit the updated baseline.

import { test, expect } from "./fixtures"

// Tolerance for cross-platform font/antialiasing diffs. Real layout
// breaks blow past this comfortably (a missing panel = thousands of
// changed pixels = many percent of viewport).
const PIXEL_TOLERANCE = { maxDiffPixelRatio: 0.05 }

test.describe("visual regression", () => {
  test("empty app shell", async ({ page, debug }) => {
    void debug
    await page.goto("/")
    await expect(page.getByTestId("example-button")).toBeVisible({ timeout: 15_000 })
    // Brief settle for any async render (fonts, deferred panels).
    await page.waitForTimeout(750)

    await expect(page).toHaveScreenshot("empty-app-shell.png", PIXEL_TOLERANCE)
  })

  test("blink LED loaded", async ({ page, debug }) => {
    void debug
    await page.goto("/")
    await page.getByTestId("example-button").click()
    await page.getByTestId("example-row-ex-led").click()
    // Let the breadboard re-render + simulation pipeline settle.
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot("blink-led-loaded.png", PIXEL_TOLERANCE)
  })
})

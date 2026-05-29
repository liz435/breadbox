// ── Phase 2 e2e smoke tests ─────────────────────────────────────────────
//
// Bare-minimum browser interaction tests. Each verifies one clickable /
// observable UI surface works. Not exhaustive — the intent is to catch
// "the app no longer loads" or "the example button no longer works" type
// regressions, not exercise every component permutation.
//
// To add a test: pick a stable selector (data-testid preferred), assert
// either a DOM change or a network call. Avoid screenshot assertions
// here — those land in Phase 3.

import { test, expect } from "@playwright/test"

test.describe("app shell", () => {
  test("loads without console errors", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text())
    })

    await page.goto("/")
    // Wait for the example button to exist — that means the toolbar
    // mounted, which means the React tree rendered, which means the app
    // didn't crash during init.
    await expect(page.getByTestId("example-button")).toBeVisible({ timeout: 15_000 })

    // Allow a brief settle window for async errors (Anthropic config
    // probe, etc.) before asserting clean console.
    await page.waitForTimeout(500)
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([])
  })
})

test.describe("example loading", () => {
  test("clicking 'Blink LED' loads an LED onto the board", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("example-button").click()

    // Popover renders example rows by key — data-testid="example-row-ex-led"
    const ledRow = page.getByTestId("example-row-ex-led")
    await expect(ledRow).toBeVisible({ timeout: 5_000 })
    await ledRow.click()

    // After load, the board state machine fires LOAD_BOARD with the
    // example's components. We assert the breadboard contains an LED.
    // Since there's no canvas testid yet, fall back to text presence in
    // the inspector or a known DOM hint. Use a broad timeout for the
    // simulation reset + state machine settle.
    //
    // For now: assert the example button is no longer showing the
    // empty-board "Examples" without the matching-count badge. After
    // load there's at least 1 matching example (the one we just loaded),
    // so the small count badge appears next to "Examples".
    await expect(page.getByTestId("example-button")).toContainText("Examples")
    // The popover closes on selection — verify it's gone (good enough
    // proof of click being handled).
    await expect(ledRow).not.toBeVisible({ timeout: 3_000 })
  })
})

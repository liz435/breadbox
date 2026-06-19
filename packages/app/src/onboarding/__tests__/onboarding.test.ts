// ── Onboarding gating + step integrity ───────────────────────────────────
//
// Covers the pure first-run decision (seen-flag × empty-project matrix) and a
// structural check that every tour step is wired to a real anchor.

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  hasSeenOnboarding,
  isProjectEmpty,
  markOnboardingSeen,
  shouldAutoStartOnboarding,
} from "../use-onboarding"
import { ONBOARDING_STEPS } from "../onboarding-steps"

// bun:test has no DOM, so stub a minimal in-memory localStorage for the
// flag-based helpers. Reset it before each test.
function installLocalStorage(): void {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

describe("isProjectEmpty", () => {
  test("undefined board is empty", () => {
    expect(isProjectEmpty(undefined)).toBe(true)
  })

  test("board with no components is empty", () => {
    expect(isProjectEmpty({ components: {} })).toBe(true)
  })

  test("board with a component is not empty", () => {
    expect(isProjectEmpty({ components: { led1: {} } })).toBe(false)
  })
})

describe("onboarding seen flag", () => {
  beforeEach(installLocalStorage)
  afterEach(() => {
    // @ts-expect-error — tearing down the stub between suites
    delete globalThis.localStorage
  })

  test("defaults to not-seen, then sticks once marked", () => {
    expect(hasSeenOnboarding()).toBe(false)
    markOnboardingSeen()
    expect(hasSeenOnboarding()).toBe(true)
  })
})

describe("shouldAutoStartOnboarding", () => {
  beforeEach(installLocalStorage)
  afterEach(() => {
    // @ts-expect-error — tearing down the stub between suites
    delete globalThis.localStorage
  })

  test("fresh + empty project → auto-start", () => {
    expect(shouldAutoStartOnboarding({ components: {} })).toBe(true)
  })

  test("fresh but non-empty project → no auto-start (don't clobber a circuit)", () => {
    expect(shouldAutoStartOnboarding({ components: { led1: {} } })).toBe(false)
  })

  test("already seen → no auto-start even on an empty project", () => {
    markOnboardingSeen()
    expect(shouldAutoStartOnboarding({ components: {} })).toBe(false)
  })
})

describe("onboarding steps", () => {
  test("every step has a unique id and non-empty copy", () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of ONBOARDING_STEPS) {
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.body.length).toBeGreaterThan(0)
    }
  })

  test("anchors reference the known data-onboarding targets", () => {
    // Keep in sync with the `data-onboarding="…"` attributes placed in the UI.
    const KNOWN_ANCHORS = new Set([
      "modes",
      "components",
      "canvas",
      "sketch",
      "run",
      "ai-chat",
    ])
    for (const s of ONBOARDING_STEPS) {
      if (s.anchor === undefined) continue
      expect(KNOWN_ANCHORS.has(s.anchor)).toBe(true)
    }
  })
})

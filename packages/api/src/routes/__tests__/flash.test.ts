// Flash-route port-allowlist test.
//
// Full end-to-end testing of /api/flash would need arduino-cli + a real
// USB device, neither of which fits in unit-test scope. Instead we
// verify:
//   1. The port-allowlist predicate rejects unsafe paths and accepts
//      the documented shapes.
//   2. The route short-circuits on a bad port (4xx, no subprocess
//      spawn) regardless of hosted/local mode — `IS_HOSTED` may already
//      be cached `true` by a sibling test file, so the route might
//      answer 403 (hosted gate) or 400 (our allowlist). Both are
//      "rejected before any expensive work" which is the guarantee we
//      actually care about.

import { afterAll, describe, expect, test } from "bun:test"
import { Elysia } from "elysia"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { isAllowedFlashPort } from "../flash"

const TEST_DATA_DIR = await mkdtemp(join(tmpdir(), "dreamer-flash-route-"))
process.env.DATA_DIR = TEST_DATA_DIR

const { flashRoutes } = await import("../flash")

const testAuthPlugin = new Elysia({ name: "test-auth" }).derive(
  { as: "global" },
  () => ({
    auth: {
      userId: "test-owner",
      sessionId: null,
      mode: "dev" as const,
    },
  }),
)

const app = new Elysia().use(testAuthPlugin).use(flashRoutes)

afterAll(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true })
})

async function post(body: unknown): Promise<Response> {
  return app.handle(
    new Request("http://localhost/api/flash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

describe("port allowlist predicate", () => {
  test("accepts documented port shapes", () => {
    expect(isAllowedFlashPort("/dev/tty.usbmodem1234")).toBe(true)
    expect(isAllowedFlashPort("/dev/cu.usbmodem1234")).toBe(true)
    expect(isAllowedFlashPort("/dev/ttyUSB0")).toBe(true)
    expect(isAllowedFlashPort("/dev/ttyACM1")).toBe(true)
    expect(isAllowedFlashPort("/dev/ttyS0")).toBe(true)
    expect(isAllowedFlashPort("COM1")).toBe(true)
    expect(isAllowedFlashPort("COM42")).toBe(true)
  })

  test("rejects non-tty devices", () => {
    expect(isAllowedFlashPort("/dev/sda")).toBe(false)
    expect(isAllowedFlashPort("/dev/sdb1")).toBe(false)
    expect(isAllowedFlashPort("/dev/null")).toBe(false)
    expect(isAllowedFlashPort("/dev/zero")).toBe(false)
    expect(isAllowedFlashPort("/dev/disk0")).toBe(false)
  })

  test("rejects path traversal and shell injection", () => {
    expect(isAllowedFlashPort("/dev/../etc/passwd")).toBe(false)
    expect(isAllowedFlashPort("/dev/ttyUSB0; rm -rf /")).toBe(false)
    expect(isAllowedFlashPort("/dev/ttyUSB0 && echo x")).toBe(false)
    expect(isAllowedFlashPort("../../etc/shadow")).toBe(false)
  })

  test("rejects empty / malformed", () => {
    expect(isAllowedFlashPort("")).toBe(false)
    expect(isAllowedFlashPort("/dev/")).toBe(false)
    expect(isAllowedFlashPort("ttyUSB0")).toBe(false) // missing /dev/
  })
})

describe("POST /api/flash — route rejects before subprocess spawn", () => {
  // Both 400 (our allowlist) and 403 (hosted gate) are acceptable:
  // both guarantee no arduino-cli spawn. Sibling test files set
  // BREADBOX_HOSTED globally so env may already be cached hosted.
  const acceptable = new Set([400, 403])

  test("rejects /dev/sda", async () => {
    const res = await post({
      port: "/dev/sda",
      code: "void setup(){} void loop(){}",
    })
    expect(acceptable.has(res.status)).toBe(true)
  })

  test("rejects shell-injection-ish port", async () => {
    const res = await post({
      port: "/dev/ttyUSB0; rm -rf /",
      code: "void setup(){} void loop(){}",
    })
    expect(acceptable.has(res.status)).toBe(true)
  })

  test("rejects missing code (schema)", async () => {
    const res = await post({ port: "/dev/ttyUSB0" })
    expect(acceptable.has(res.status)).toBe(true)
  })
})

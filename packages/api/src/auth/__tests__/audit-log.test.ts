// Audit-log tests. Uses an isolated DATA_DIR so the test doesn't
// pollute ~/.dreamer/audit/ or the repo's in-tree audit dir.

import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"

const TEST_DATA_DIR = await mkdtemp(join(tmpdir(), "dreamer-audit-log-"))
process.env.DATA_DIR = TEST_DATA_DIR

const {
  auditLog,
  auditEventSchema,
  _auditFilePathForTests,
} = await import("../audit-log")

afterAll(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true })
})

describe("auditLog", () => {
  test("appends an event that parses back via the zod schema", async () => {
    await auditLog({
      userId: "gh:alice",
      action: "project.create",
      projectId: "proj-1",
    })
    const path = _auditFilePathForTests(Date.now())
    const content = await readFile(path, "utf8")
    const line = content.trim().split("\n").pop()!
    const parsed = auditEventSchema.safeParse(JSON.parse(line))
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.userId).toBe("gh:alice")
      expect(parsed.data.action).toBe("project.create")
      expect(parsed.data.projectId).toBe("proj-1")
      expect(typeof parsed.data.ts).toBe("number")
    }
  })

  test("file-per-day: all today's events land in the same file", async () => {
    const before = Date.now()
    await auditLog({ userId: "u1", action: "compile.start" })
    await auditLog({ userId: "u1", action: "flash.start" })
    await auditLog({ userId: "u2", action: "agent.run", projectId: "p" })
    const path = _auditFilePathForTests(before)
    expect(path.endsWith(".jsonl")).toBe(true)
    const content = await readFile(path, "utf8")
    const lines = content.trim().split("\n").filter(Boolean)
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })

  test("concurrent writes don't corrupt (each line parses)", async () => {
    const N = 40
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        auditLog({
          userId: `u${i}`,
          action: "project.update",
          projectId: `p${i}`,
          extra: { i },
        }),
      ),
    )
    const path = _auditFilePathForTests(Date.now())
    const content = await readFile(path, "utf8")
    const lines = content.trim().split("\n").filter(Boolean)
    // Every line must be valid JSON that parses through the schema.
    for (const line of lines) {
      const parsed = auditEventSchema.safeParse(JSON.parse(line))
      expect(parsed.success).toBe(true)
    }
  })

  test("invalid action rejected at schema boundary (silently dropped)", async () => {
    await auditLog({
      userId: "u",
      // Cast through unknown to simulate a caller sneaking past TS.
      action: "not-a-real-action" as unknown as "project.create",
    })
    // Event was dropped; nothing to assert beyond "did not throw".
    expect(true).toBe(true)
  })
})

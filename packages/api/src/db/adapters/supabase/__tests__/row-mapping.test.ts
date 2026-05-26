// ── Row mapping round-trip tests ─────────────────────────────────────────
//
// The Supabase adapter strips canonical column fields from the `data
// jsonb` blob on write and re-stitches them from the row's columns on
// read. These tests guarantee the round-trip is exact for the canonical
// fields and that nothing in the rest of the payload is lost or duplicated.
//
// No Supabase stack required — pure function tests.

import { describe, expect, test } from "bun:test"
import {
  projectToRow,
  rowToProject,
  threadToRow,
  rowToThread,
  runToRow,
  rowToRun,
} from "../row-mapping"
import type {
  AgentRunFile,
  ProjectFile,
  ProjectThreadFile,
} from "../../../schemas"

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeProject(): ProjectFile {
  return {
    project: {
      id: "11111111-1111-1111-1111-111111111111",
      ownerId: "22222222-2222-2222-2222-222222222222",
      name: "test-project",
      version: 7,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-05-26T12:34:56.789Z",
      threadId: "33333333-3333-3333-3333-333333333333",
      activeSceneId: "44444444-4444-4444-4444-444444444444",
    },
    scenes: {
      "44444444-4444-4444-4444-444444444444": {
        id: "44444444-4444-4444-4444-444444444444",
        name: "Main Scene",
        version: 3,
        settings: { background: "#000000", gravity: { x: 0, y: 9.8 } },
      },
    },
    entities: {},
    sceneEntityIds: {},
    components: {
      transform: {},
      sprite: {},
      tilemap: {},
      physicsBody: {},
      script: {},
      camera: {},
    },
    assets: {},
  }
}

function makeThread(): ProjectThreadFile {
  return {
    thread: {
      id: "55555555-5555-5555-5555-555555555555",
      projectId: "11111111-1111-1111-1111-111111111111",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-05-26T13:00:00.000Z",
    },
    runIds: ["run-a", "run-b"],
  }
}

function makeRun(): AgentRunFile {
  return {
    run: {
      id: "66666666-6666-6666-6666-666666666666",
      threadId: "55555555-5555-5555-5555-555555555555",
      projectId: "11111111-1111-1111-1111-111111111111",
      sceneId: "44444444-4444-4444-4444-444444444444",
      sessionId: "session-1",
      agent: "core",
      status: "completed",
      createdAt: "2026-05-26T14:00:00.000Z",
      completedAt: "2026-05-26T14:00:05.000Z",
      agentVersion: "v1",
    },
    prompt: "do the thing",
    messages: [{ role: "assistant", content: "did the thing" }],
    proposedOps: [],
    appliedOps: [],
  }
}

// ── projects ─────────────────────────────────────────────────────────────

describe("projectToRow / rowToProject", () => {
  test("round-trip preserves the full ProjectFile shape", () => {
    const original = makeProject()
    const row = projectToRow(original)
    const restored = rowToProject({ ...row, data: row.data })
    expect(restored).toEqual(original)
  })

  test("strips canonical fields from the jsonb blob", () => {
    const original = makeProject()
    const row = projectToRow(original)
    // The `data.project` inside the blob must NOT carry the column-canonical
    // keys. If it did, a future bug could let the column and blob drift.
    const inner = (row.data as { project: Record<string, unknown> }).project
    expect(inner.id).toBeUndefined()
    expect(inner.ownerId).toBeUndefined()
    expect(inner.name).toBeUndefined()
    expect(inner.version).toBeUndefined()
    expect(inner.createdAt).toBeUndefined()
    expect(inner.updatedAt).toBeUndefined()
    // Non-canonical fields stay
    expect(inner.threadId).toBe(original.project.threadId)
    expect(inner.activeSceneId).toBe(original.project.activeSceneId)
  })

  test("column values win over stale blob values (drift defense)", () => {
    const original = makeProject()
    const row = projectToRow(original)
    // Simulate drift: pretend the jsonb blob somehow carried an old
    // version (this should never happen in practice — projectToRow strips
    // those — but a future bug could). Re-stitch must trust the column.
    const driftedBlob = {
      ...(row.data as object),
      project: {
        ...(row.data as { project: object }).project,
        id: "drifted-id",
        name: "drifted-name",
        version: 0,
      },
    }
    const restored = rowToProject({ ...row, data: driftedBlob })
    expect(restored.project.id).toBe(original.project.id)
    expect(restored.project.name).toBe(original.project.name)
    expect(restored.project.version).toBe(original.project.version)
  })
})

// ── threads ──────────────────────────────────────────────────────────────

describe("threadToRow / rowToThread", () => {
  test("round-trip preserves the full ProjectThreadFile shape", () => {
    const original = makeThread()
    const row = threadToRow(original)
    const restored = rowToThread({ ...row, data: row.data })
    expect(restored).toEqual(original)
  })
})

// ── agent runs ───────────────────────────────────────────────────────────

describe("runToRow / rowToRun", () => {
  test("round-trip preserves the full AgentRunFile shape", () => {
    const original = makeRun()
    const row = runToRow(original)
    const restored = rowToRun({ ...row, data: row.data })
    expect(restored).toEqual(original)
  })

  test("status column value wins over blob (mirror of project drift defense)", () => {
    const original = makeRun()
    const row = runToRow(original)
    const driftedBlob = {
      ...(row.data as object),
      run: {
        ...(row.data as { run: object }).run,
        status: "running",
      },
    }
    const restored = rowToRun({ ...row, data: driftedBlob })
    expect(restored.run.status).toBe("completed")
  })
})

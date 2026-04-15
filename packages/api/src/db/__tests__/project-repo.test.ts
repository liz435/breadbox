/**
 * Integration tests for project-repo.ts
 *
 * These tests run against the real repo (real filesystem under data/).
 * Each test creates projects with tracked IDs and deletes them in afterEach
 * so the data directory is left clean.
 */
import { describe, test, expect, afterEach, afterAll } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DATA_DIR = await mkdtemp(join(tmpdir(), "dreamer-api-project-repo-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { projectRepo, VersionConflictError } = await import("../project-repo");

// Track every project created so we can delete it in afterEach
const created: string[] = [];

async function make(name = "Test Project") {
  const p = await projectRepo.createProject({ name });
  created.push(p.project.id);
  return p;
}

afterEach(async () => {
  await Promise.all(created.map((id) => projectRepo.deleteProject(id)));
  created.length = 0;
});

afterAll(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
});

// ── create / read / delete ────────────────────────────────────────────────────

describe("projectRepo — create / read / delete", () => {
  test("createProject returns a valid project with default fields", async () => {
    const p = await make("My Project");
    expect(p.project.name).toBe("My Project");
    expect(p.project.version).toBe(0);
    expect(typeof p.project.id).toBe("string");
    expect(Object.keys(p.scenes)).toHaveLength(1);
  });

  test("createProject throws on duplicate id", async () => {
    const first = await make("First");
    await expect(
      projectRepo.createProject({ id: first.project.id, name: "Dupe" })
    ).rejects.toThrow("already exists");
  });

  test("readProject returns null for unknown id", async () => {
    expect(await projectRepo.readProject("does-not-exist")).toBeNull();
  });

  test("readProject round-trips persisted data", async () => {
    const p = await make("Persist Me");
    const read = await projectRepo.readProject(p.project.id);
    expect(read?.project.name).toBe("Persist Me");
    expect(read?.project.id).toBe(p.project.id);
  });

  test("deleteProject removes the file and returns true", async () => {
    const p = await make("To Delete");
    const id = p.project.id;
    // Remove from tracking — we're deleting manually
    created.splice(created.indexOf(id), 1);

    expect(await projectRepo.deleteProject(id)).toBe(true);
    expect(await projectRepo.readProject(id)).toBeNull();
  });

  test("deleteProject returns false for unknown id", async () => {
    expect(await projectRepo.deleteProject("no-such-id")).toBe(false);
  });

  test("listProjects includes newly created projects", async () => {
    const p1 = await make("Alpha");
    const p2 = await make("Beta");
    const list = await projectRepo.listProjects();
    const ids = list.map((p) => p.id);
    expect(ids).toContain(p1.project.id);
    expect(ids).toContain(p2.project.id);
  });
});

// ── rename ────────────────────────────────────────────────────────────────────

describe("projectRepo — rename", () => {
  test("renameProject updates name on disk", async () => {
    const p = await make("Old Name");
    await projectRepo.renameProject(p.project.id, "New Name");
    const read = await projectRepo.readProject(p.project.id);
    expect(read?.project.name).toBe("New Name");
  });

  test("renameProject returns null for unknown id", async () => {
    expect(await projectRepo.renameProject("nope", "Whatever")).toBeNull();
  });

  test("renameScene updates scene name", async () => {
    const p = await make("P");
    const sceneId = Object.keys(p.scenes)[0]!;
    await projectRepo.renameScene(p.project.id, sceneId, "Act 1");
    const read = await projectRepo.readProject(p.project.id);
    expect(read?.scenes[sceneId]?.name).toBe("Act 1");
  });
});

// ── saveBoardAndGraph (atomic save) ───────────────────────────────────────────

describe("projectRepo — saveBoardAndGraph", () => {
  const boardState = {
    components: {},
    wires: {},
    libraryState: { servos: {}, lcd: null, serialBaud: 9600 },
    serialOutput: [],
    sketchCode: "// saved",
    customLibraries: {},
    environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
  };

  test("saves board and graph atomically", async () => {
    const p = await make("Board+Graph");
    const result = await projectRepo.saveBoardAndGraph(p.project.id, {
      boardState,
      graph: { nodes: {}, edges: {} },
    });
    expect(result?.saved).toBe(true);

    const read = await projectRepo.readProject(p.project.id);
    expect(read?.boardState?.sketchCode).toBe("// saved");
    expect(read?.graph).toEqual({ nodes: {}, edges: {} });
  });

  test("board-only save does not overwrite existing graph", async () => {
    const p = await make("Partial");
    // Save graph first
    await projectRepo.saveBoardAndGraph(p.project.id, {
      graph: {
        nodes: {
          "n1": {
            id: "n1", type: "setup" as const, name: "Setup",
            x: 0, y: 0, width: 160, height: 70, ports: [], data: {},
          },
        },
        edges: {},
      },
    });
    // Save board only — must not clobber graph
    await projectRepo.saveBoardAndGraph(p.project.id, { boardState });

    const read = await projectRepo.readProject(p.project.id);
    expect(read?.boardState?.sketchCode).toBe("// saved");
    expect(Object.keys(read?.graph?.nodes ?? {})).toHaveLength(1);
  });

  test("returns null for unknown project", async () => {
    const result = await projectRepo.saveBoardAndGraph("no-such-id", {
      graph: { nodes: {}, edges: {} },
    });
    expect(result).toBeNull();
  });
});

// ── applyBoardOps ─────────────────────────────────────────────────────────────

describe("projectRepo — applyBoardOps", () => {
  test("place_component then remove_component round-trip", async () => {
    const p = await make("Ops Test");
    const id = p.project.id;
    const sceneId = Object.keys(p.scenes)[0]!;
    const compId = crypto.randomUUID();

    await projectRepo.applyBoardOps(id, {
      expectedVersion: p.project.version,
      ops: [
        {
          opId: crypto.randomUUID(),
          projectId: id,
          sceneId,
          expectedVersion: p.project.version,
          timestamp: new Date().toISOString(),
          kind: "place_component",
          payload: {
            component: {
              id: compId,
              type: "led",
              name: "LED 1",
              x: 5, y: 10, rotation: 0,
              pins: { anode: 13, cathode: null },
              properties: { color: "#ef4444" },
            },
          },
        },
      ],
    });

    const after1 = await projectRepo.readProject(id);
    expect(after1?.boardState?.components[compId]?.name).toBe("LED 1");

    await projectRepo.applyBoardOps(id, {
      expectedVersion: after1!.project.version,
      ops: [
        {
          opId: crypto.randomUUID(),
          projectId: id,
          sceneId,
          expectedVersion: after1!.project.version,
          timestamp: new Date().toISOString(),
          kind: "remove_component",
          payload: { componentId: compId },
        },
      ],
    });

    const after2 = await projectRepo.readProject(id);
    expect(after2?.boardState?.components[compId]).toBeUndefined();
    expect(after2?.project.version).toBe(p.project.version + 2);
  });

  test("update_sketch persists new code", async () => {
    const p = await make("Sketch");
    const sceneId = Object.keys(p.scenes)[0]!;

    await projectRepo.applyBoardOps(p.project.id, {
      expectedVersion: p.project.version,
      ops: [
        {
          opId: crypto.randomUUID(),
          projectId: p.project.id,
          sceneId,
          expectedVersion: p.project.version,
          timestamp: new Date().toISOString(),
          kind: "update_sketch",
          payload: { code: "void setup() { pinMode(13, OUTPUT); }" },
        },
      ],
    });

    const read = await projectRepo.readProject(p.project.id);
    expect(read?.boardState?.sketchCode).toBe("void setup() { pinMode(13, OUTPUT); }");
  });
});

// ── version conflict detection ────────────────────────────────────────────────

describe("projectRepo — version conflict detection", () => {
  test("applyOps throws VersionConflictError on stale version", async () => {
    const p = await make("Conflict");
    const sceneId = Object.keys(p.scenes)[0]!;

    await expect(
      projectRepo.applyOps(p.project.id, {
        expectedVersion: 99, // wrong — actual is 0
        ops: [
          {
            opId: crypto.randomUUID(),
            projectId: p.project.id,
            sceneId,
            expectedVersion: 99,
            timestamp: new Date().toISOString(),
            kind: "update_scene_settings",
            payload: { patch: { background: "#000000" } },
          },
        ],
      })
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  test("applyOps succeeds with correct version and bumps it", async () => {
    const p = await make("Versioned");
    const sceneId = Object.keys(p.scenes)[0]!;

    const result = await projectRepo.applyOps(p.project.id, {
      expectedVersion: 0,
      ops: [
        {
          opId: crypto.randomUUID(),
          projectId: p.project.id,
          sceneId,
          expectedVersion: 0,
          timestamp: new Date().toISOString(),
          kind: "update_scene_settings",
          payload: { patch: { background: "#111111" } },
        },
      ],
    });

    expect(result?.newVersion).toBe(1);
  });
});

// ── getOrCreateProject ────────────────────────────────────────────────────────

describe("projectRepo — getOrCreateProject", () => {
  test("creates when id does not exist", async () => {
    const id = crypto.randomUUID();
    const p = await projectRepo.getOrCreateProject({ id, name: "New" });
    created.push(p.project.id);
    expect(p.project.id).toBe(id);
  });

  test("returns existing project when id already exists", async () => {
    const first = await make("Existing");
    const second = await projectRepo.getOrCreateProject({
      id: first.project.id,
      name: "Would-be duplicate",
    });
    expect(second.project.id).toBe(first.project.id);
    expect(second.project.name).toBe("Existing");
  });
});

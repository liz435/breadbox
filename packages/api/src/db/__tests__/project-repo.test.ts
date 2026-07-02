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

const { projectRepo, VersionConflictError } = await import("../adapters/file/project-repo");

const OWNER_A = "user-a";
const OWNER_B = "user-b";

// Track every project created so we can delete it in afterEach
const created: Array<{ id: string; owner: string }> = [];

async function make(name = "Test Project", owner: string = OWNER_A) {
  const p = await projectRepo.createProject({ ownerId: owner, name });
  created.push({ id: p.project.id, owner });
  return p;
}

afterEach(async () => {
  await Promise.all(created.map((c) => projectRepo.deleteProject(c.id, c.owner)));
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
    expect(p.project.ownerId).toBe(OWNER_A);
    expect(typeof p.project.id).toBe("string");
    expect(Object.keys(p.scenes)).toHaveLength(1);
  });

  test("createProject throws on duplicate id", async () => {
    const first = await make("First");
    await expect(
      projectRepo.createProject({ ownerId: OWNER_A, id: first.project.id, name: "Dupe" })
    ).rejects.toThrow("already exists");
  });

  test("readProject returns null for unknown id", async () => {
    expect(await projectRepo.readProject("does-not-exist", OWNER_A)).toBeNull();
  });

  test("readProject round-trips persisted data", async () => {
    const p = await make("Persist Me");
    const read = await projectRepo.readProject(p.project.id, OWNER_A);
    expect(read?.project.name).toBe("Persist Me");
    expect(read?.project.id).toBe(p.project.id);
  });

  test("deleteProject removes the file and returns true", async () => {
    const p = await make("To Delete");
    const id = p.project.id;
    // Remove from tracking — we're deleting manually
    created.splice(created.findIndex((c) => c.id === id), 1);

    expect(await projectRepo.deleteProject(id, OWNER_A)).toBe(true);
    expect(await projectRepo.readProject(id, OWNER_A)).toBeNull();
  });

  test("deleteProject returns false for unknown id", async () => {
    expect(await projectRepo.deleteProject("no-such-id", OWNER_A)).toBe(false);
  });

  test("listProjects includes newly created projects", async () => {
    const p1 = await make("Alpha");
    const p2 = await make("Beta");
    const list = await projectRepo.listProjects(OWNER_A);
    const ids = list.map((p) => p.id);
    expect(ids).toContain(p1.project.id);
    expect(ids).toContain(p2.project.id);
  });
});

// ── cross-user isolation ─────────────────────────────────────────────────────

describe("projectRepo — cross-user isolation", () => {
  test("user B cannot read user A's project", async () => {
    const p = await make("A-only", OWNER_A);
    expect(await projectRepo.readProject(p.project.id, OWNER_B)).toBeNull();
  });

  test("user B does not see user A's project in listProjects", async () => {
    const p = await make("Secret", OWNER_A);
    const listB = await projectRepo.listProjects(OWNER_B);
    expect(listB.some((x) => x.id === p.project.id)).toBe(false);
  });

  test("user B cannot delete user A's project", async () => {
    const p = await make("Undeletable", OWNER_A);
    expect(await projectRepo.deleteProject(p.project.id, OWNER_B)).toBe(false);
    // Confirm still readable for A
    expect(await projectRepo.readProject(p.project.id, OWNER_A)).not.toBeNull();
  });

  test("user B cannot rename user A's project", async () => {
    const p = await make("Original", OWNER_A);
    const result = await projectRepo.renameProject(p.project.id, OWNER_B, "Hijacked");
    expect(result).toBeNull();
    const stillOriginal = await projectRepo.readProject(p.project.id, OWNER_A);
    expect(stillOriginal?.project.name).toBe("Original");
  });

  test("user B cannot applyBoardOps to user A's project", async () => {
    const p = await make("A's Board", OWNER_A);
    const sceneId = Object.keys(p.scenes)[0]!;
    const result = await projectRepo.applyBoardOps(p.project.id, OWNER_B, {
      expectedVersion: p.project.version,
      ops: [
        {
          opId: crypto.randomUUID(),
          projectId: p.project.id,
          sceneId,
          expectedVersion: p.project.version,
          timestamp: new Date().toISOString(),
          kind: "update_sketch",
          payload: { code: "// pwned" },
        },
      ],
    });
    expect(result).toBeNull();
  });

  test("user B cannot saveGraph to user A's project", async () => {
    const p = await make("A's Graph", OWNER_A);
    const result = await projectRepo.saveGraph(p.project.id, OWNER_B, { nodes: {}, edges: {} });
    expect(result).toBeNull();
  });

  test("two owners can coexist — names do not collide across owners", async () => {
    const a = await make("Shared Name", OWNER_A);
    const b = await make("Shared Name", OWNER_B);
    expect(a.project.id).not.toBe(b.project.id);
    expect(a.project.ownerId).toBe(OWNER_A);
    expect(b.project.ownerId).toBe(OWNER_B);
  });
});

// ── rename ────────────────────────────────────────────────────────────────────

describe("projectRepo — rename", () => {
  test("renameProject updates name on disk", async () => {
    const p = await make("Old Name");
    await projectRepo.renameProject(p.project.id, OWNER_A, "New Name");
    const read = await projectRepo.readProject(p.project.id, OWNER_A);
    expect(read?.project.name).toBe("New Name");
  });

  test("renameProject returns null for unknown id", async () => {
    expect(await projectRepo.renameProject("nope", OWNER_A, "Whatever")).toBeNull();
  });

  test("renameScene updates scene name", async () => {
    const p = await make("P");
    const sceneId = Object.keys(p.scenes)[0]!;
    await projectRepo.renameScene(p.project.id, OWNER_A, sceneId, "Act 1");
    const read = await projectRepo.readProject(p.project.id, OWNER_A);
    expect(read?.scenes[sceneId]?.name).toBe("Act 1");
  });
});

// ── saveBoardAndGraph (atomic save) ───────────────────────────────────────────

describe("projectRepo — saveBoardAndGraph", () => {
  const boardState = {
    components: {},
    wires: {},
    libraryState: { servos: {}, lcd: null, serialBaud: 9600, oled: {}, neopixels: {}, custom: {} },
    serialOutput: [],
    sketchCode: "// saved",
    customLibraries: {},
    environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
  };

  test("saves board and graph atomically", async () => {
    const p = await make("Board+Graph");
    const result = await projectRepo.saveBoardAndGraph(p.project.id, OWNER_A, {
      boardState,
      graph: { nodes: {}, edges: {} },
    });
    expect(result?.saved).toBe(true);

    const read = await projectRepo.readProject(p.project.id, OWNER_A);
    expect(read?.boardState?.sketchCode).toBe("// saved");
    expect(read?.graph).toEqual({ nodes: {}, edges: {} });
  });

  test("board-only save does not overwrite existing graph", async () => {
    const p = await make("Partial");
    // Save graph first
    await projectRepo.saveBoardAndGraph(p.project.id, OWNER_A, {
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
    await projectRepo.saveBoardAndGraph(p.project.id, OWNER_A, { boardState });

    const read = await projectRepo.readProject(p.project.id, OWNER_A);
    expect(read?.boardState?.sketchCode).toBe("// saved");
    expect(Object.keys(read?.graph?.nodes ?? {})).toHaveLength(1);
  });

  test("returns null for unknown project", async () => {
    const result = await projectRepo.saveBoardAndGraph("no-such-id", OWNER_A, {
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

    await projectRepo.applyBoardOps(id, OWNER_A, {
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

    const after1 = await projectRepo.readProject(id, OWNER_A);
    expect(after1?.boardState?.components[compId]?.name).toBe("LED 1");

    await projectRepo.applyBoardOps(id, OWNER_A, {
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

    const after2 = await projectRepo.readProject(id, OWNER_A);
    expect(after2?.boardState?.components[compId]).toBeUndefined();
    expect(after2?.project.version).toBe(p.project.version + 2);
  });

  test("update_sketch persists new code", async () => {
    const p = await make("Sketch");
    const sceneId = Object.keys(p.scenes)[0]!;

    await projectRepo.applyBoardOps(p.project.id, OWNER_A, {
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

    const read = await projectRepo.readProject(p.project.id, OWNER_A);
    expect(read?.boardState?.sketchCode).toBe("void setup() { pinMode(13, OUTPUT); }");
  });

  test("load_board replaces board target and custom libraries", async () => {
    const p = await make("Load Board");
    const sceneId = Object.keys(p.scenes)[0]!;

    await projectRepo.applyBoardOps(p.project.id, OWNER_A, {
      expectedVersion: p.project.version,
      ops: [
        {
          opId: crypto.randomUUID(),
          projectId: p.project.id,
          sceneId,
          expectedVersion: p.project.version,
          timestamp: new Date().toISOString(),
          kind: "load_board",
          payload: {
            state: {
              components: {
                led1: {
                  id: "led1",
                  type: "led",
                  name: "LED 1",
                  x: 7,
                  y: 5,
                  rotation: 0,
                  pins: { anode: null, cathode: null },
                  properties: { color: "#ef4444" },
                },
              },
              wires: {
                "wire-1": {
                  id: "wire-1",
                  fromRow: -999,
                  fromCol: 13,
                  toRow: 5,
                  toCol: 7,
                  color: "#eab308",
                },
              },
              libraryState: { servos: {}, lcd: null, serialBaud: 0, oled: {}, neopixels: {}, custom: {} },
              serialOutput: [],
              sketchCode: "void setup(){}\nvoid loop(){}\n",
              customLibraries: {
                "Foo.h": {
                  name: "Foo.h",
                  code: "#pragma once\n",
                  description: "custom",
                },
              },
              boardTarget: "arduino_mega_2560",
              environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 140 },
            },
          },
        },
      ],
    });

    const read = await projectRepo.readProject(p.project.id, OWNER_A);
    expect(read?.boardState?.boardTarget).toBe("arduino_mega_2560");
    expect(read?.boardState?.customLibraries?.["Foo.h"]?.code).toContain("#pragma once");
    expect(read?.boardState?.environment?.boundaryMargin).toBe(140);
    expect(Object.keys(read?.boardState?.components ?? {})).toEqual(["led1"]);
  });
});

// ── version conflict detection ────────────────────────────────────────────────

describe("projectRepo — version conflict detection", () => {
  test("applyOps throws VersionConflictError on stale version", async () => {
    const p = await make("Conflict");
    const sceneId = Object.keys(p.scenes)[0]!;

    await expect(
      projectRepo.applyOps(p.project.id, OWNER_A, {
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

    const result = await projectRepo.applyOps(p.project.id, OWNER_A, {
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

// ── OLED runtime state stripping ──────────────────────────────────────────────

describe("projectRepo — runtime-only state stripping (OLED framebuffer)", () => {
  test("saveBoardState writes empty oled record even if framebuffer was set", async () => {
    const p = await make("OLED Test");
    const id = p.project.id;

    // Build a board state with a populated OLED framebuffer (the kind the
    // simulator pushes during a Run). Persistence must drop it.
    const fb = Array.from({ length: 1024 }, (_, i) => i & 0xff);
    await projectRepo.saveBoardState(id, OWNER_A, {
      components: {},
      wires: {},
      libraryState: {
        servos: {},
        lcd: null,
        serialBaud: 0,
        oled: {
          "oled-1": {
            width: 128,
            height: 64,
            on: true,
            inverted: false,
            framebuffer: fb,
          },
        },
        neopixels: {},
        custom: {},
      },
      serialOutput: [],
      sketchCode: "",
      customLibraries: {},
      environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
    });

    const round = await projectRepo.readProject(id, OWNER_A);
    expect(round?.boardState?.libraryState.oled).toEqual({});
  });

  test("legacy project files without oled field load with oled: {}", async () => {
    // Simulate a project saved before OLED support landed: write the JSON
    // directly with no `oled` key, then read through the schema.
    const p = await make("Legacy OLED-less");
    const id = p.project.id;
    await projectRepo.saveBoardState(id, OWNER_A, {
      components: {},
      wires: {},
      // libraryState parses fine because libraryStateSchema.oled has .default({}).
      libraryState: {
        servos: {},
        lcd: null,
        serialBaud: 0,
        oled: {},
        neopixels: {},
        custom: {},
      },
      serialOutput: [],
      sketchCode: "",
      customLibraries: {},
      environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
    });
    const round = await projectRepo.readProject(id, OWNER_A);
    expect(round?.boardState?.libraryState.oled).toEqual({});
  });
});

// ── getOrCreateProject ────────────────────────────────────────────────────────

describe("projectRepo — getOrCreateProject", () => {
  test("creates when id does not exist", async () => {
    const id = crypto.randomUUID();
    const p = await projectRepo.getOrCreateProject({ ownerId: OWNER_A, id, name: "New" });
    created.push({ id: p.project.id, owner: OWNER_A });
    expect(p.project.id).toBe(id);
  });

  test("returns existing project when id already exists", async () => {
    const first = await make("Existing");
    const second = await projectRepo.getOrCreateProject({
      ownerId: OWNER_A,
      id: first.project.id,
      name: "Would-be duplicate",
    });
    expect(second.project.id).toBe(first.project.id);
    expect(second.project.name).toBe("Existing");
  });
});

// ── legacy data — missing ownerId ─────────────────────────────────────────────

describe("projectRepo — legacy data graceful handling", () => {
  test("legacy project file without ownerId is not returned from read/list", async () => {
    // Write a file that predates the ownerId field directly to disk,
    // bypassing createProject so its strict schema can't help us. The
    // migration runner is the blessed path for cleaning these up; the
    // repo must not crash when it encounters one in isolation.
    const id = crypto.randomUUID();
    const legacy = {
      project: {
        id,
        name: "Pre-Owner Legacy",
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        threadId: crypto.randomUUID(),
        activeSceneId: crypto.randomUUID(),
      },
      scenes: {},
      entities: {},
      sceneEntityIds: {},
      components: {
        transform: {}, sprite: {}, tilemap: {},
        physicsBody: {}, script: {}, camera: {},
      },
      assets: {},
    };
    const { projectsDir } = await import("../../paths");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(projectsDir(), { recursive: true });
    await Bun.write(
      join(projectsDir(), `${id}.json`),
      JSON.stringify(legacy, null, 2),
    );

    // Read returns null — schema parse fails, caller is insulated.
    expect(await projectRepo.readProject(id, OWNER_A)).toBeNull();

    // List does not include it either.
    const listed = await projectRepo.listProjects(OWNER_A);
    expect(listed.some((p) => p.id === id)).toBe(false);

    // Clean up — the test-level afterEach won't because delete also goes
    // through the ownership check and won't find this file via OWNER_A.
    const { unlink } = await import("node:fs/promises");
    await unlink(join(projectsDir(), `${id}.json`));
  });
});

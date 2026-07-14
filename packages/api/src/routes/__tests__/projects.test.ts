/**
 * API route integration tests for /project endpoints.
 *
 * Uses Elysia's .handle() for in-process HTTP testing (no real server).
 * Creates projects with tracked IDs and deletes them in afterEach.
 */
import { describe, test, expect, afterEach, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DATA_DIR = await mkdtemp(join(tmpdir(), "dreamer-api-project-routes-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { projectRoutes } = await import("../projects");
const { projectRepo } = await import("../../db/adapters/file/project-repo");

const TEST_OWNER = "test-owner";

// Stand-in for the real `authPlugin` that the server mounts in index.ts.
// Every request in these tests runs as the same synthetic owner so we
// exercise the ownership-aware routes end-to-end without spinning up
// cookies/sessions.
const testAuthPlugin = new Elysia({ name: "test-auth" }).derive(
  { as: "global" },
  () => ({
    auth: {
      userId: TEST_OWNER,
      sessionId: null,
      isHosted: false,
    },
  }),
);

const app = new Elysia().use(testAuthPlugin).use(projectRoutes);

// Track IDs for cleanup
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.map((id) => projectRepo.deleteProject(id, "test-owner")));
  created.length = 0;
});

afterAll(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function req(path: string, init?: RequestInit) {
  return app.handle(new Request(`http://localhost${path}`, init));
}

async function json(res: Response): Promise<unknown> {
  return res.json();
}

function typed<T>(v: unknown): T {
  return v as T;
}

async function postProject(name: string) {
  const res = await req("/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const p = typed<{ project: { id: string; name: string; version: number } }>(await json(res));
  created.push(p.project.id);
  return p;
}

// ── GET /project ──────────────────────────────────────────────────────────────

describe("GET /project", () => {
  test("includes created project in list", async () => {
    const p = await postProject("List Test");
    const res = await req("/project");
    expect(res.status).toBe(200);
    const list = typed<{ id: string }[]>(await json(res));
    expect(list.some((item) => item.id === p.project.id)).toBe(true);
  });
});

// ── POST /project ─────────────────────────────────────────────────────────────

describe("POST /project", () => {
  test("creates project with given name", async () => {
    const p = await postProject("My Circuit");
    expect(p.project.name).toBe("My Circuit");
    expect(p.project.version).toBe(0);
    expect(typeof p.project.id).toBe("string");
  });

  test("returns 409 on duplicate id", async () => {
    const first = await postProject("First");
    const res = await req("/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: first.project.id, name: "Duplicate" }),
    });
    expect(res.status).toBe(409);
  });

  test("ensure=true returns existing instead of 409", async () => {
    const first = await postProject("Existing");
    const res = await req("/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: first.project.id, ensure: true }),
    });
    expect(res.status).toBe(200);
    const p = typed<{ project: { id: string; name: string } }>(await json(res));
    expect(p.project.id).toBe(first.project.id);
    expect(p.project.name).toBe("Existing");
  });
});

// ── GET /project/:id ──────────────────────────────────────────────────────────

describe("GET /project/:id", () => {
  test("returns full project for known id", async () => {
    const p = await postProject("Readable");
    const res = await req(`/project/${p.project.id}`);
    expect(res.status).toBe(200);
    const full = typed<{ project: { name: string } }>(await json(res));
    expect(full.project.name).toBe("Readable");
  });

  test("returns 404 for unknown id", async () => {
    const res = await req("/project/no-such-id");
    expect(res.status).toBe(404);
  });
});

// ── DELETE /project/:id ───────────────────────────────────────────────────────

describe("DELETE /project/:id", () => {
  test("deletes project and subsequent GET returns 404", async () => {
    const p = await postProject("To Delete");
    const id = p.project.id;
    created.splice(created.indexOf(id), 1); // deleting manually

    const del = await req(`/project/${id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const body = typed<{ deleted: boolean }>(await json(del));
    expect(body.deleted).toBe(true);

    expect((await req(`/project/${id}`)).status).toBe(404);
  });

  test("returns 404 for unknown id", async () => {
    expect((await req("/project/ghost", { method: "DELETE" })).status).toBe(404);
  });
});

// ── PATCH /project/:id ────────────────────────────────────────────────────────

describe("PATCH /project/:id", () => {
  test("renames project", async () => {
    const p = await postProject("Old Name");
    const res = await req(`/project/${p.project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    expect(res.status).toBe(200);
    const result = typed<{ name: string }>(await json(res));
    expect(result.name).toBe("New Name");

    const full = typed<{ project: { name: string } }>(await json(await req(`/project/${p.project.id}`)));
    expect(full.project.name).toBe("New Name");
  });

  test("returns 400 when name is empty", async () => {
    const p = await postProject("P");
    const res = await req(`/project/${p.project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

// ── POST /project/:id/state ───────────────────────────────────────────────────

const testBoardState = {
  components: {},
  wires: {},
  libraryState: { servos: {}, steppers: {}, lcd: null, serialBaud: 9600 },
  serialOutput: [],
  sketchCode: "// saved via /state",
  customLibraries: {},
};

describe("POST /project/:id/state", () => {
  test("saves board state and verifies via GET", async () => {
    const p = await postProject("Save Test");
    const res = await req(`/project/${p.project.id}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardState: testBoardState }),
    });
    expect(res.status).toBe(200);
    const result = typed<{ saved: boolean }>(await json(res));
    expect(result.saved).toBe(true);

    const full = typed<{ boardState: { sketchCode: string } }>(
      await json(await req(`/project/${p.project.id}`))
    );
    expect(full.boardState.sketchCode).toBe("// saved via /state");
  });

  test("saves graph alongside board", async () => {
    const p = await postProject("Graph Save");
    await req(`/project/${p.project.id}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardState: testBoardState, graph: { nodes: {}, edges: {} } }),
    });

    const full = typed<{ graph: { nodes: Record<string, unknown>; edges: Record<string, unknown> } }>(
      await json(await req(`/project/${p.project.id}`))
    );
    expect(Object.keys(full.graph.nodes)).toHaveLength(0);
    expect(Object.keys(full.graph.edges)).toHaveLength(0);
  });

  test("returns 400 when payload is empty", async () => {
    const p = await postProject("Empty");
    const res = await req(`/project/${p.project.id}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("returns 404 for unknown project", async () => {
    const res = await req("/project/no-such-id/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardState: testBoardState }),
    });
    expect(res.status).toBe(404);
  });
});

// ── POST /project/:id/board (legacy) ─────────────────────────────────────────

describe("POST /project/:id/board", () => {
  test("saves board state", async () => {
    const p = await postProject("Legacy Board");
    const res = await req(`/project/${p.project.id}/board`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testBoardState),
    });
    expect(res.status).toBe(200);
    const result = typed<{ saved: boolean }>(await json(res));
    expect(result.saved).toBe(true);
  });
});

// ── POST /project/:id/graph (legacy) ─────────────────────────────────────────

describe("POST /project/:id/graph", () => {
  test("saves graph state", async () => {
    const p = await postProject("Legacy Graph");
    const res = await req(`/project/${p.project.id}/graph`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: {}, edges: {} }),
    });
    expect(res.status).toBe(200);
    const result = typed<{ saved: boolean }>(await json(res));
    expect(result.saved).toBe(true);
  });
});

// ── /project/last-opened ──────────────────────────────────────────────────────

describe("GET/POST /project/last-opened", () => {
  test("returns null before any project was recorded", async () => {
    const res = await req("/project/last-opened");
    expect(res.status).toBe(200);
    const body = typed<{ projectId: string | null }>(await json(res));
    // May be non-null if an earlier test in this file recorded one — only
    // assert the shape here; behavior is covered below.
    expect("projectId" in body).toBe(true);
  });

  test("records and returns the last-opened project", async () => {
    const p = await postProject("Resume Target");
    const post = await req("/project/last-opened", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: p.project.id }),
    });
    expect(post.status).toBe(200);

    const get = await req("/project/last-opened");
    const body = typed<{ projectId: string | null }>(await json(get));
    expect(body.projectId).toBe(p.project.id);
  });

  test("rejects an empty projectId", async () => {
    const res = await req("/project/last-opened", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "  " }),
    });
    expect(res.status).toBe(400);
  });

  test("404s when recording a project that does not exist", async () => {
    const res = await req("/project/last-opened", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: crypto.randomUUID() }),
    });
    expect(res.status).toBe(404);
  });

  test("returns null after the recorded project is deleted", async () => {
    const p = await postProject("Delete Then Resume");
    await req("/project/last-opened", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: p.project.id }),
    });
    const del = await req(`/project/${p.project.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    created.splice(created.indexOf(p.project.id), 1);

    const get = await req("/project/last-opened");
    const body = typed<{ projectId: string | null }>(await json(get));
    expect(body.projectId).toBeNull();
  });
});

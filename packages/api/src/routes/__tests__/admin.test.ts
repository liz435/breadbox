/**
 * Admin claim-project integration tests.
 *
 * Exercises the hosted admin path end-to-end: drop a file in
 * `_legacy/`, POST /api/admin/claim-project with an admin-authored
 * session, and confirm the file migrates to the active dir with the
 * target ownerId stamped onto `project.ownerId`.
 */

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { Elysia } from "elysia";
import { mkdir, mkdtemp, rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DATA_DIR = await mkdtemp(join(tmpdir(), "dreamer-auth-admin-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.DREAMER_HOSTED = "1";
process.env.AUTH_SECRETS = "test-secret-admin";
process.env.ADMIN_GITHUB_LOGINS = "admin-login";
// env.ts is loaded once per test process; set GitHub creds here so
// auth-github.test.ts (which runs in the same process) also finds them
// populated even if it loads env.ts later in the import order.
process.env.GITHUB_CLIENT_ID ??= "test-client-id";
process.env.GITHUB_CLIENT_SECRET ??= "test-client-secret";

const { adminRoutes } = await import("../admin");
const { createSession, deleteSession } = await import(
  "../../auth/session-store"
);
const { legacyProjectsDir, projectsDir } = await import("../../paths");

// The admin route mounts authPlugin internally — in the test rig we only
// need the route; Host/Origin gates don't fire for same-origin test
// requests since no `origin` header is sent.
const app = new Elysia().use(adminRoutes);

afterAll(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────

const legacyTemplate = (id: string) => ({
  project: {
    id,
    name: "Legacy",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  },
  scenes: {},
  assets: {},
  graph: { nodes: {}, edges: {} },
  boardState: null,
});

async function writeLegacy(id: string): Promise<void> {
  await mkdir(legacyProjectsDir(), { recursive: true });
  await Bun.write(
    join(legacyProjectsDir(), `${id}.json`),
    JSON.stringify(legacyTemplate(id), null, 2),
  );
}

async function writeActive(id: string): Promise<void> {
  await mkdir(projectsDir(), { recursive: true });
  await Bun.write(
    join(projectsDir(), `${id}.json`),
    JSON.stringify({ ...legacyTemplate(id), project: { ...legacyTemplate(id).project, ownerId: "someone" } }, null, 2),
  );
}

async function claim(
  body: unknown,
  opts: { sid?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.sid) headers.cookie = `dreamer_session=${opts.sid}`;
  return app.handle(
    new Request("http://localhost/api/admin/claim-project", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("POST /api/admin/claim-project — auth", () => {
  test("non-admin session → 403", async () => {
    const { sid } = await createSession({
      userId: "gh:nonadmin",
      githubLogin: "nonadmin",
    });
    try {
      const id = crypto.randomUUID();
      await writeLegacy(id);
      const res = await claim(
        { projectId: id, targetUserId: "gh:target" },
        { sid },
      );
      expect(res.status).toBe(403);
    } finally {
      await deleteSession(sid);
    }
  });

  test("no session cookie → 403", async () => {
    const id = crypto.randomUUID();
    await writeLegacy(id);
    // Middleware requires auth on this path; with no session cookie the
    // upstream authPlugin 401s before admin even runs. Either 401 or
    // 403 is acceptable — both communicate "you may not do this".
    const res = await claim({ projectId: id, targetUserId: "gh:x" });
    expect([401, 403]).toContain(res.status);
  });
});

describe("POST /api/admin/claim-project — happy path", () => {
  let adminSid = "";

  beforeEach(async () => {
    const { sid } = await createSession({
      userId: "gh:admin-login",
      githubLogin: "admin-login",
    });
    adminSid = sid;
  });

  afterEach(async () => {
    if (adminSid) await deleteSession(adminSid);
  });

  test("moves legacy → active with stamped ownerId", async () => {
    const id = crypto.randomUUID();
    await writeLegacy(id);

    const res = await claim(
      { projectId: id, targetUserId: "gh:newowner" },
      { sid: adminSid },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; ownerId?: string };
    expect(body.ok).toBe(true);
    expect(body.ownerId).toBe("gh:newowner");

    const activePath = join(projectsDir(), `${id}.json`);
    expect(existsSync(activePath)).toBe(true);
    const active = (await Bun.file(activePath).json()) as {
      project: { ownerId?: string };
    };
    expect(active.project.ownerId).toBe("gh:newowner");

    // Legacy source file should no longer exist in its original slot
    // (it's been moved to `.claimed` for audit).
    const legacyPath = join(legacyProjectsDir(), `${id}.json`);
    expect(existsSync(legacyPath)).toBe(false);
  });

  test("404 when legacy file absent", async () => {
    const res = await claim(
      { projectId: crypto.randomUUID(), targetUserId: "gh:anyone" },
      { sid: adminSid },
    );
    expect(res.status).toBe(404);
  });

  test("409 when active project id collides", async () => {
    const id = crypto.randomUUID();
    await writeLegacy(id);
    await writeActive(id);

    const res = await claim(
      { projectId: id, targetUserId: "gh:owner" },
      { sid: adminSid },
    );
    expect(res.status).toBe(409);
  });

  test("400 on invalid body", async () => {
    const res = await claim({ projectId: 42 }, { sid: adminSid });
    expect(res.status).toBe(400);
  });

  test("400 on traversal-ish projectId", async () => {
    const res = await claim(
      { projectId: "../evil", targetUserId: "gh:owner" },
      { sid: adminSid },
    );
    expect(res.status).toBe(400);
  });
});

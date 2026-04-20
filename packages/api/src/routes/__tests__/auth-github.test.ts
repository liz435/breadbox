/**
 * Auth route integration tests — OAuth start/callback/me/logout.
 *
 * Mocks `fetch` for GitHub endpoints and uses Elysia's `.handle()` for
 * in-process HTTP testing. Uses an isolated DATA_DIR so session files
 * don't collide with other test suites or the developer's real data.
 *
 * Hosted-mode tests need `DREAMER_HOSTED=1` to load the env module with
 * the right module-local constant; we set that before importing.
 */

import {
  afterEach,
  afterAll,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { Elysia } from "elysia";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DATA_DIR = await mkdtemp(join(tmpdir(), "dreamer-auth-github-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.DREAMER_HOSTED = "1";
process.env.AUTH_SECRETS = "test-secret-1";
process.env.GITHUB_CLIENT_ID = "test-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-client-secret";

const { authRoutes } = await import("../auth");
const { createSession, readSession, deleteSession } = await import(
  "../../auth/session-store"
);
const { signState } = await import("../../auth/oauth-state");

const app = new Elysia().use(authRoutes);

afterAll(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────

async function req(path: string, init?: RequestInit): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init));
}

function parseSetCookies(res: Response): Record<string, { value: string; attrs: string }> {
  const out: Record<string, { value: string; attrs: string }> = {};
  // Elysia's Response is a standard Fetch Response; headers.getSetCookie()
  // returns all Set-Cookie entries.
  const entries =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") ?? "").split(/,(?=\s*\w+=)/);
  for (const line of entries) {
    if (!line) continue;
    const [pair, ...rest] = line.split(";");
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    out[name] = { value, attrs: rest.map((s) => s.trim()).join("; ") };
  }
  return out;
}

type MockResponse = {
  url: string | RegExp;
  respond: (req: Request) => Promise<Response> | Response;
};

function installFetchMock(handlers: MockResponse[]): () => void {
  const base = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const request = new Request(url, init);
    for (const h of handlers) {
      const match =
        typeof h.url === "string" ? url.startsWith(h.url) : h.url.test(url);
      if (match) return h.respond(request);
    }
    throw new Error(`unhandled fetch: ${url}`);
  };
  // `typeof fetch` carries a `preconnect` side-property that the code
  // under test never calls; attach a noop so the signature matches without
  // an unsafe cast.
  const impl = Object.assign(base, { preconnect: () => {} }) as typeof fetch;
  const spy = spyOn(globalThis, "fetch").mockImplementation(impl);
  return () => spy.mockRestore();
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("GET /api/auth/github/start", () => {
  test("302s to github with state param and sets nonce cookie", async () => {
    const res = await req("/api/auth/github/start");
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location") ?? "";
    expect(loc.startsWith("https://github.com/login/oauth/authorize")).toBe(true);
    const locUrl = new URL(loc);
    expect(locUrl.searchParams.get("client_id")).toBe("test-client-id");
    expect(locUrl.searchParams.get("state")).toBeTruthy();
    const cookies = parseSetCookies(res);
    expect(cookies["dreamer_oauth_nonce"]).toBeDefined();
    expect(cookies["dreamer_oauth_nonce"]?.value.length ?? 0).toBeGreaterThan(0);
    expect(cookies["dreamer_oauth_nonce"]?.attrs.toLowerCase()).toContain("httponly");
  });

  test("sanitizes open-redirect attempts in ?redirect=", async () => {
    const res = await req(
      "/api/auth/github/start?redirect=https://evil.example/x",
    );
    expect(res.status).toBe(302);
    // The state is signed — decode its payload segment and confirm the
    // redirectPath was forced to "/".
    const loc = res.headers.get("Location") ?? "";
    const state = new URL(loc).searchParams.get("state") ?? "";
    const body = state.split(".")[0] ?? "";
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    expect(decoded.redirectPath).toBe("/");
  });
});

describe("GET /api/auth/github/callback", () => {
  const flushedSessions: string[] = [];
  afterEach(async () => {
    for (const sid of flushedSessions) await deleteSession(sid);
    flushedSessions.length = 0;
  });

  test("rejects unsigned state", async () => {
    const res = await req(
      `/api/auth/github/callback?code=abc&state=not-a-valid-state`,
      {
        headers: {
          cookie: "dreamer_oauth_nonce=anything",
        },
      },
    );
    expect(res.status).toBe(400);
  });

  test("rejects when nonce cookie is missing or wrong", async () => {
    const state = signState({
      nonce: "expected-nonce",
      redirectPath: "/",
      iat: Date.now(),
    });
    const res = await req(
      `/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`,
      {
        headers: { cookie: "dreamer_oauth_nonce=different-nonce" },
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("nonce mismatch");
  });

  test("happy path: creates session and 302s to redirectPath", async () => {
    const nonce = "matching-nonce-abc";
    const redirectPath = "/app/after-login";
    const state = signState({ nonce, redirectPath, iat: Date.now() });

    const restoreFetch = installFetchMock([
      {
        url: "https://github.com/login/oauth/access_token",
        respond: () =>
          new Response(
            JSON.stringify({ access_token: "gho_test", token_type: "bearer" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      },
      {
        url: "https://api.github.com/user",
        respond: () =>
          new Response(
            JSON.stringify({
              id: 42,
              login: "octocat",
              email: "octo@example.com",
              name: "Octo Cat",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      },
    ]);

    try {
      const res = await req(
        `/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`,
        { headers: { cookie: `dreamer_oauth_nonce=${nonce}` } },
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(redirectPath);
      const cookies = parseSetCookies(res);
      expect(cookies["dreamer_session"]).toBeDefined();
      const sid = cookies["dreamer_session"]?.value ?? "";
      expect(sid.length).toBeGreaterThan(0);
      flushedSessions.push(sid);

      const session = await readSession(sid);
      expect(session?.userId).toBe("gh:octocat");
      expect(session?.githubLogin).toBe("octocat");

      // Nonce cookie must be cleared (Max-Age=0)
      expect(cookies["dreamer_oauth_nonce"]?.attrs.toLowerCase()).toContain(
        "max-age=0",
      );
    } finally {
      restoreFetch();
    }
  });

  test("falls back to /user/emails when /user returns email=null", async () => {
    const nonce = "nonce-no-email";
    const state = signState({ nonce, redirectPath: "/", iat: Date.now() });

    const restoreFetch = installFetchMock([
      {
        url: "https://github.com/login/oauth/access_token",
        respond: () =>
          new Response(JSON.stringify({ access_token: "gho_test" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      },
      {
        url: "https://api.github.com/user/emails",
        respond: () =>
          new Response(
            JSON.stringify([
              { email: "other@example.com", primary: false, verified: true },
              { email: "prim@example.com", primary: true, verified: true },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      },
      {
        url: "https://api.github.com/user",
        respond: () =>
          new Response(
            JSON.stringify({ id: 7, login: "ghost", email: null, name: null }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      },
    ]);

    try {
      const res = await req(
        `/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`,
        { headers: { cookie: `dreamer_oauth_nonce=${nonce}` } },
      );
      expect(res.status).toBe(302);
      const sid =
        parseSetCookies(res)["dreamer_session"]?.value ?? "";
      flushedSessions.push(sid);
      const session = await readSession(sid);
      expect(session?.githubLogin).toBe("ghost");
    } finally {
      restoreFetch();
    }
  });
});

describe("POST /api/auth/logout", () => {
  test("deletes session and clears cookie", async () => {
    const { sid } = await createSession({
      userId: "gh:logoutuser",
      githubLogin: "logoutuser",
    });
    expect(await readSession(sid)).not.toBeNull();

    const res = await req("/api/auth/logout", {
      method: "POST",
      headers: { cookie: `dreamer_session=${sid}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
    expect(await readSession(sid)).toBeNull();

    const cookies = parseSetCookies(res);
    expect(cookies["dreamer_session"]?.attrs.toLowerCase()).toContain(
      "max-age=0",
    );
  });
});

describe("GET /api/auth/me", () => {
  test("returns null user when no cookie, with hosted mode", async () => {
    const res = await req("/api/auth/me");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: unknown; mode: string };
    expect(body.user).toBeNull();
    // This test suite sets DREAMER_HOSTED=1 before importing, so mode is always "hosted".
    expect(body.mode).toBe("hosted");
  });

  test("returns session user when cookie valid, with mode", async () => {
    const { sid } = await createSession({
      userId: "gh:alice",
      githubLogin: "alice",
    });
    try {
      const res = await req("/api/auth/me", {
        headers: { cookie: `dreamer_session=${sid}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        user: { userId: string; githubLogin: string } | null;
        mode: string;
      };
      expect(body.user?.userId).toBe("gh:alice");
      expect(body.user?.githubLogin).toBe("alice");
      expect(body.mode).toBe("hosted");
    } finally {
      await deleteSession(sid);
    }
  });

  test("returns null with mode when session is expired", async () => {
    const { sid } = await createSession({
      userId: "gh:expired",
      githubLogin: "expired",
      ttlMs: -1000, // already expired
    });
    try {
      const res = await req("/api/auth/me", {
        headers: { cookie: `dreamer_session=${sid}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: unknown; mode: string };
      expect(body.user).toBeNull();
      expect(body.mode).toBe("hosted");
    } finally {
      await deleteSession(sid);
    }
  });
});

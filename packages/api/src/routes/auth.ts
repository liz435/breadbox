// ── Auth routes ─────────────────────────────────────────────────────────
//
// Single-tenant local auth: there is no sign-in flow. The endpoints keep
// their historical shapes so the web UI works unchanged:
//
//   GET  /auth/sign-in    — 404 (no auth flow)
//   GET  /auth/callback   — 404
//   POST /auth/sign-out   — no-op { ok: true }
//   GET  /api/auth/me     — the fixed local user (never 401s)

import { Elysia } from "elysia"
import { CLI_LOCAL_USER_ID } from "../env"
import { getApiKey } from "../config"

export const authRoutes = new Elysia({ name: "auth-routes" })
  .get("/auth/sign-in", ({ set }) => {
    set.status = 404
    return { error: "not found" }
  })
  .get("/auth/callback", ({ set }) => {
    set.status = 404
    return { error: "not found" }
  })
  .post("/auth/sign-out", () => ({ ok: true }))
  // Discovery endpoint — never 401s. Reports whether an Anthropic key is
  // available (env set at boot, or persisted in the config file) so the
  // UI can prompt for one when missing.
  .get("/api/auth/me", async () => {
    const hasApiKey = (await getApiKey()) !== null
    return {
      user: { userId: CLI_LOCAL_USER_ID, githubLogin: "local" },
      isHosted: false as const,
      hasApiKey,
    }
  })

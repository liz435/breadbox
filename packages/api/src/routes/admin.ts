// ── Admin routes ────────────────────────────────────────────────────────
//
// POST /api/admin/claim-project
//
// In hosted mode the ownership migration moves legacy (unowned) projects
// into `$DREAMER_HOME/projects/_legacy/{id}.json` where they are
// invisible to listing. An admin — identified by `ADMIN_GITHUB_LOGINS`
// and authenticated via the ordinary session cookie — assigns each one
// to a user and moves it back into the active dir.
//
// Hosted-only by design. Local mode has no admin flow; the migration
// stamps `ownerId: "local"` in place and there is nothing to claim.

import { Elysia } from "elysia"
import { rename } from "node:fs/promises"
import { join } from "node:path"
import { z, ZodError } from "zod"
import { ADMIN_GITHUB_LOGINS, IS_HOSTED } from "../env"
import { legacyProjectsDir, projectsDir } from "../paths"
import { authPlugin } from "../auth/auth-plugin"
import type { AuthContext } from "../auth/context"
import { auditLog } from "../auth/audit-log"
import { createRequestClient, type ElysiaCookieJar } from "../supabase/request-client"
import { IS_HOSTED_MODE } from "../supabase/env"
import { createLogger } from "../logger"

const log = createLogger("admin-routes")

const claimBodySchema = z.object({
  projectId: z.string().min(1),
  targetUserId: z.string().min(1),
})

// Project IDs are UUIDs; harden against anything that could walk out of
// the legacy dir via a crafted body.
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]+$/

async function resolveAdminLogin(
  auth: AuthContext | null | undefined,
  request: Request,
  set: { headers: Record<string, string | string[]> },
): Promise<string | null> {
  if (!auth || !IS_HOSTED_MODE) return null
  const jar: ElysiaCookieJar = {
    cookieHeader: request.headers.get("cookie"),
    pendingSetCookies: [],
  }
  const supabase = createRequestClient(jar)
  const { data, error } = await supabase.auth.getUser()
  if (jar.pendingSetCookies.length > 0) {
    const existing = set.headers["set-cookie"]
    set.headers["set-cookie"] = existing
      ? [
          ...(Array.isArray(existing) ? existing : [existing]),
          ...jar.pendingSetCookies,
        ]
      : jar.pendingSetCookies
  }
  if (error || !data.user) return null
  const meta = (data.user.user_metadata ?? {}) as {
    user_name?: string
    preferred_username?: string
  }
  const githubLogin = meta.user_name ?? meta.preferred_username
  if (!githubLogin) return null
  if (!ADMIN_GITHUB_LOGINS.includes(githubLogin)) return null
  return githubLogin
}

export const adminRoutes = new Elysia({ name: "admin-routes" })
  .use(authPlugin)
  .post("/api/admin/claim-project", async ({ auth, request, body, set }) => {
    if (!IS_HOSTED) {
      set.status = 404
      return { error: "not found" }
    }
    const adminLogin = await resolveAdminLogin(
      auth,
      request,
      set as { headers: Record<string, string | string[]> },
    )
    if (!adminLogin) {
      set.status = 403
      return { error: "forbidden" }
    }

    let parsed: z.infer<typeof claimBodySchema>
    try {
      parsed = claimBodySchema.parse(body)
    } catch (err) {
      if (err instanceof ZodError) {
        set.status = 400
        return { error: "invalid body", details: err.flatten() }
      }
      throw err
    }

    if (!PROJECT_ID_PATTERN.test(parsed.projectId)) {
      set.status = 400
      return { error: "invalid projectId" }
    }

    const legacyPath = join(legacyProjectsDir(), `${parsed.projectId}.json`)
    const activePath = join(projectsDir(), `${parsed.projectId}.json`)

    const legacyFile = Bun.file(legacyPath)
    if (!(await legacyFile.exists())) {
      set.status = 404
      return { error: "legacy project not found" }
    }
    const activeFile = Bun.file(activePath)
    if (await activeFile.exists()) {
      set.status = 409
      return { error: "active project id already exists" }
    }

    let raw: unknown
    try {
      raw = await legacyFile.json()
    } catch {
      set.status = 500
      return { error: "legacy file unreadable" }
    }

    // Loose shape — the migration probe already filtered to files whose
    // structure includes `project.id`. We just need to stamp `ownerId`.
    if (typeof raw !== "object" || raw === null) {
      set.status = 500
      return { error: "legacy file malformed" }
    }
    const root = raw as Record<string, unknown>
    const project = root.project
    if (typeof project !== "object" || project === null) {
      set.status = 500
      return { error: "legacy file malformed" }
    }
    const stamped: Record<string, unknown> = {
      ...root,
      project: {
        ...(project as Record<string, unknown>),
        ownerId: parsed.targetUserId,
      },
    }
    await Bun.write(activePath, JSON.stringify(stamped, null, 2))
    try {
      await rename(legacyPath, `${legacyPath}.claimed`)
    } catch {
      // Rename-out is best-effort: the file is already duplicated into
      // the active dir; on failure we just leave the legacy copy and an
      // admin can delete it manually. Avoid `unlink` to keep an audit
      // trail of what was claimed.
    }

    log.info(
      `admin ${adminLogin} claimed project ${parsed.projectId} for ${parsed.targetUserId}`,
    )
    void auditLog({
      userId: auth?.userId ?? `admin:${adminLogin}`,
      action: "admin.claim-project",
      projectId: parsed.projectId,
      extra: {
        adminLogin,
        targetUserId: parsed.targetUserId,
      },
    })
    return { ok: true, projectId: parsed.projectId, ownerId: parsed.targetUserId }
  })

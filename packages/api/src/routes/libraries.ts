// ── Library Management Routes ────────────────────────────────────────────
//
// GET  /api/libraries/installed  → currently installed libraries
// POST /api/libraries/install    → install a library by name (+ optional version)
// GET  /api/libraries/search?q=  → search the Arduino index
//
// These wrap `arduino-cli lib` subcommands. No project-state writes — the
// Arduino CLI maintains install state globally at `~/.arduino15/libraries/`.
//
// Backend-only; no UI wiring yet. Consumers: the CLI's `dreamer lib *`
// subcommand (future), the agent's compile tool, and anything that drives
// a web UI with a real Download button.

import { Elysia } from "elysia"
import { z } from "zod"
import { installLibrary, listInstalledLibraries, searchLibraries, uninstallLibrary } from "../libraries"
import { createLogger } from "../logger"

const log = createLogger("libraries-route")

const installRequestSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional(),
})

const uninstallRequestSchema = z.object({
  name: z.string().min(1),
})

export const libraryRoutes = new Elysia()

  .get("/api/libraries/installed", async () => {
    const libs = await listInstalledLibraries()
    return { libraries: libs }
  })

  .get("/api/libraries/search", async ({ query, set }) => {
    const q = typeof query.q === "string" ? query.q : ""
    if (!q.trim()) {
      set.status = 400
      return { error: "missing ?q=<query>" }
    }
    const libs = await searchLibraries(q)
    return { libraries: libs }
  })

  .post("/api/libraries/install", async ({ body, set }) => {
    // Hosted deployments ship with a fixed pre-baked library set. Mutating
    // endpoints are 403 so multi-tenant state doesn't drift and users get
    // a clear error instead of a silent "install succeeded but won't
    // persist across deploys" surprise.
    if (process.env.DREAMER_HOSTED === "1") {
      set.status = 403
      return {
        success: false,
        error: "Hosted mode — libraries are pre-installed. Run the Dreamer CLI locally for the full library index.",
      }
    }
    const parsed = installRequestSchema.safeParse(body)
    if (!parsed.success) {
      set.status = 400
      return { error: parsed.error.issues[0]?.message ?? "Invalid request" }
    }
    const { name, version } = parsed.data
    log.info(`installing ${name}${version ? `@${version}` : ""}`)
    const result = await installLibrary(name, version ? { version } : undefined)
    if (!result.success) {
      set.status = 500
      return { success: false, error: result.error }
    }
    return { success: true, name, version }
  })

  .post("/api/libraries/uninstall", async ({ body, set }) => {
    if (process.env.DREAMER_HOSTED === "1") {
      set.status = 403
      return {
        success: false,
        error: "Hosted mode — library set is fixed. Run the Dreamer CLI locally to manage libraries.",
      }
    }
    const parsed = uninstallRequestSchema.safeParse(body)
    if (!parsed.success) {
      set.status = 400
      return { error: parsed.error.issues[0]?.message ?? "Invalid request" }
    }
    const { name } = parsed.data
    log.info(`uninstalling ${name}`)
    const result = await uninstallLibrary(name)
    if (!result.success) {
      set.status = 500
      return { success: false, error: result.error }
    }
    return { success: true, name }
  })

// ── Config route (CLI/desktop only) ──────────────────────────────────────
//
// POST /api/config/anthropic-key — persist the user's Anthropic API key to
// ~/.dreamer/config.json and apply it to the running process so the next
// agent call works without a restart. This is the in-app equivalent of
// `dreamer config set anthropic-key`, used by the desktop key dialog.

import { Elysia } from "elysia"
import { z } from "zod"
import { setApiKey } from "../config"
import { createLogger } from "../logger"

const log = createLogger("config-routes")

const setKeyBodySchema = z.object({
  key: z.string().trim().min(1),
})

export const configRoutes = new Elysia({ name: "config-routes" }).post(
  "/api/config/anthropic-key",
  async ({ body, set }) => {
    const parsed = setKeyBodySchema.safeParse(body)
    if (!parsed.success) {
      set.status = 400
      return { error: "`key` must be a non-empty string" }
    }
    const key = parsed.data.key

    try {
      await setApiKey(key)
    } catch (err) {
      log.error(`failed to persist anthropic key: ${err instanceof Error ? err.message : err}`)
      set.status = 500
      return { error: "failed to save key" }
    }

    // Apply to the running process. In CLI/desktop mode the Anthropic
    // provider falls back to process.env.ANTHROPIC_API_KEY (read lazily per
    // request), so the next agent call picks this up with no restart.
    process.env.ANTHROPIC_API_KEY = key
    return { ok: true }
  },
)

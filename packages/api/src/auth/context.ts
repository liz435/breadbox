// ── Auth context ─────────────────────────────────────────────────────────
//
// Shape of the per-request `auth` object threaded by the auth plugin.
// Every authenticated route reads from this; the schema is the single
// source of truth so downstream ownership checks and rate-limit keys
// can't drift from what middleware actually sets.

import { z } from "zod"

export const authContextSchema = z.object({
  userId: z.string(),
  sessionId: z.string().nullable(),
  mode: z.enum(["hosted", "local", "dev"]),
})

export type AuthContext = z.infer<typeof authContextSchema>

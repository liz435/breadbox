// ── Supabase env parsing ────────────────────────────────────────────────
//
// Single source of truth for Supabase config + the runtime mode flag.
// Read at import time so a missing/malformed env is visible at boot
// rather than at the first DB call.

import { z } from "zod"

const modeSchema = z
  .enum(["cli", "hosted"])
  .default("cli")
  .catch("cli")

/**
 * Deploy mode. `cli` (default) uses file-based storage and bypasses auth;
 * `hosted` uses Supabase Auth + Postgres + Storage. Pinned at startup.
 */
export const DREAMER_MODE: "cli" | "hosted" = modeSchema.parse(
  process.env.DREAMER_MODE,
)

export const IS_HOSTED_MODE = DREAMER_MODE === "hosted"

/**
 * Default user id used in CLI mode when auth is bypassed. Stable across
 * processes so file-backed projects on disk keep matching their
 * `ownerId` field. Has the shape of a UUID for forward-compatibility
 * with hosted mode's `auth.users.id` column type, even though CLI mode
 * never writes to Postgres.
 */
export const CLI_LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001"

// In CLI mode all Supabase env can be empty — nothing reads them. In
// hosted mode they're required, and we fail loud at startup if missing.
function requireInHostedMode(value: string | undefined, key: string): string {
  if (IS_HOSTED_MODE && (value == null || value.length === 0)) {
    throw new Error(
      `${key} is required in hosted mode (DREAMER_MODE=hosted). ` +
        `Either set the env var, or run with DREAMER_MODE=cli.`,
    )
  }
  return value ?? ""
}

export const SUPABASE_URL: string = requireInHostedMode(
  process.env.SUPABASE_URL,
  "SUPABASE_URL",
)

export const SUPABASE_ANON_KEY: string = requireInHostedMode(
  process.env.SUPABASE_ANON_KEY,
  "SUPABASE_ANON_KEY",
)

// Service-role key isn't read here — it lives in `secrets.ts` and is
// captured by `bootstrap-secrets.ts` before any other module loads.
// See `admin-client.ts` for the consumer.

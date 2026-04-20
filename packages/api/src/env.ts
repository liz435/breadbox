// ── Runtime env flags ────────────────────────────────────────────────────
//
// Single source of truth for env-var parsing so routes and services don't
// each reparse `process.env.*` with their own rules. The capabilities
// endpoint derives the client-visible `hosted` flag from this same value,
// so server gates and UI gates can't disagree.

import { randomBytes } from "crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { z } from "zod"
import { dreamerHome } from "./paths"

export const IS_HOSTED = process.env.DREAMER_HOSTED === "1"

// ── Env schemas ──────────────────────────────────────────────────────────

const csvList = z
  .string()
  .optional()
  .transform((raw): string[] =>
    raw == null
      ? []
      : raw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
  )

const boolFlag = z
  .string()
  .optional()
  .transform((raw): boolean => raw === "1" || raw === "true")

const optionalString = z
  .string()
  .optional()
  .transform((raw): string => raw ?? "")

// ── Parsed exports ───────────────────────────────────────────────────────

export const GITHUB_CLIENT_ID: string = optionalString.parse(
  process.env.GITHUB_CLIENT_ID,
)
export const GITHUB_CLIENT_SECRET: string = optionalString.parse(
  process.env.GITHUB_CLIENT_SECRET,
)

/** Comma-separated rotation list; index 0 is the active signer. */
export const AUTH_SECRETS: string[] = csvList.parse(process.env.AUTH_SECRETS)

/** GitHub logins authorized to run admin endpoints (project claim, etc.). */
export const ADMIN_GITHUB_LOGINS: string[] = csvList.parse(
  process.env.ADMIN_GITHUB_LOGINS,
)

/** Dev-only shim: bypass auth when running `bun run dev` without the CLI bootstrap flow. */
export const DREAMER_DEV_SKIP_AUTH: boolean = boolFlag.parse(
  process.env.DREAMER_DEV_SKIP_AUTH,
)

/**
 * Network interface the API binds to. Default `0.0.0.0` for hosted
 * (Railway) deployments; `dreamer headed` sets `127.0.0.1` so the local
 * API is loopback-only and not reachable from the LAN.
 */
export const DREAMER_BIND: string =
  (process.env.DREAMER_BIND && process.env.DREAMER_BIND.trim()) || "0.0.0.0"

// ── Local-token resolution ───────────────────────────────────────────────
//
// HMAC key for signing the bootstrap nonce the CLI prints to the terminal.
// Auto-generated on first use and persisted to disk so every `dreamer
// headed` invocation reuses the same secret — without this, each restart
// would invalidate the previously-issued URL. Persisted under
// $DREAMER_HOME rather than $DREAMER_MACHINE_HOME because sessions and
// project data share the same trust domain.

const LOCAL_TOKEN_FILE = join(dreamerHome(), "local-token")

function resolveLocalToken(): string {
  const fromEnv = process.env.DREAMER_LOCAL_TOKEN
  if (fromEnv && fromEnv.length > 0) return fromEnv
  try {
    if (existsSync(LOCAL_TOKEN_FILE)) {
      const fromDisk = readFileSync(LOCAL_TOKEN_FILE, "utf8").trim()
      if (fromDisk.length > 0) return fromDisk
    }
  } catch {
    // fall through to regen
  }
  const generated = randomBytes(32).toString("base64url")
  try {
    mkdirSync(dirname(LOCAL_TOKEN_FILE), { recursive: true })
    writeFileSync(LOCAL_TOKEN_FILE, generated, { mode: 0o600 })
  } catch {
    // non-persistent fallback — per-process key still unblocks local dev
  }
  return generated
}

/** HMAC key for the local `/__bootstrap` nonce. Auto-generated + persisted if unset. */
export const DREAMER_LOCAL_TOKEN: string = resolveLocalToken()

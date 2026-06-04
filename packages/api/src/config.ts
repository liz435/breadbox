// ── User config (~/.dreamer/config.json) ─────────────────────────────────
//
// Shared disk-config layer used by both the CLI and the API server. It owns
// reading/writing the on-disk config and the API-key accessors. The CLI
// re-exports these (see packages/cli/src/config.ts) and adds its own
// TTY-only prompt helpers on top.
//
// Stores user-specific settings:
//   - anthropic.apiKey (required for agent calls)
//   - telemetry.enabled / telemetry.installId
//   - updates.channel ("stable" | "beta")
//
// Access pattern:
//   - Reads: loadConfig() returns whatever's on disk (merged with defaults).
//   - Writes: saveConfig() replaces the file atomically, chmod 600.
//   - Convenience: getApiKey() prefers env ANTHROPIC_API_KEY, then config.
//
// Schema validation is zod — invalid files are treated as missing so a
// corrupted config never hard-crashes; we surface a warning instead.

import { chmod, mkdir, rename, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { z } from "zod"
import { configPath, dreamerHome } from "./paths"
import { getAnthropicApiKey } from "./secrets"

export const configSchema = z.object({
  anthropic: z.object({
    apiKey: z.string().min(1),
  }).partial().optional(),
  telemetry: z.object({
    enabled: z.boolean(),
    installId: z.string().uuid().optional(),
  }).partial().optional(),
  updates: z.object({
    channel: z.enum(["stable", "beta"]),
  }).partial().optional(),
}).passthrough()

export type Config = z.infer<typeof configSchema>

export async function loadConfig(): Promise<Config> {
  const path = configPath()
  if (!existsSync(path)) return {}
  try {
    const raw = await Bun.file(path).json()
    return configSchema.parse(raw)
  } catch (err) {
    console.warn(`warning: ${path} is unreadable or invalid; ignoring. (${err instanceof Error ? err.message : err})`)
    return {}
  }
}

export async function saveConfig(next: Config): Promise<void> {
  const path = configPath()
  await mkdir(dreamerHome(), { recursive: true })
  // Atomic write: write to a sibling temp file then rename.
  const tmp = `${path}.tmp-${process.pid}`
  await writeFile(tmp, JSON.stringify(next, null, 2))
  try {
    await chmod(tmp, 0o600)
  } catch {
    // best-effort — Windows doesn't honor mode bits the same way
  }
  await rename(tmp, path)
}

export async function getApiKey(): Promise<string | null> {
  // 1. process.env — populated in CLI/headed mode (no secret lockdown) and
  //    when a key is set at runtime via the in-app dialog (routes/config.ts).
  const envKey = process.env.ANTHROPIC_API_KEY
  if (envKey && envKey.trim() !== "") return envKey
  // 2. Captured secret — the API server (packages/api/src/index.ts) runs
  //    bootstrap-secrets, which moves ANTHROPIC_API_KEY out of process.env
  //    into the secrets module before any route loads. Without this branch
  //    getApiKey() would never see a boot-time env key in that path (the
  //    `bun run dev` / e2e server), so /api/auth/me reports hasApiKey=false
  //    even when a key is set. In CLI/headed mode the capture never runs and
  //    this is "".
  const captured = getAnthropicApiKey()
  if (captured.trim() !== "") return captured
  // 3. Persisted config (~/.dreamer/config.json).
  const config = await loadConfig()
  return config.anthropic?.apiKey ?? null
}

export async function setApiKey(key: string): Promise<void> {
  const config = await loadConfig()
  await saveConfig({
    ...config,
    anthropic: { ...config.anthropic, apiKey: key },
  })
}

export async function clearApiKey(): Promise<void> {
  const config = await loadConfig()
  const next = { ...config, anthropic: { ...config.anthropic } }
  delete next.anthropic?.apiKey
  await saveConfig(next)
}

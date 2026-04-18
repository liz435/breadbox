// ── User config (~/.dreamer/config.json) ─────────────────────────────────
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
// corrupted config never hard-crashes the CLI; we surface a warning instead.

import { chmod, mkdir, rename, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { dirname } from "path"
import { z } from "zod"
import { configPath, dreamerHome } from "@dreamer/api/paths"

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
  const envKey = process.env.ANTHROPIC_API_KEY
  if (envKey && envKey.trim() !== "") return envKey
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

// ── First-run prompt ────────────────────────────────────────────────────

export class ApiKeyMissingError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. Provide it via env or run `dreamer config set anthropic-key <value>`.",
    )
    this.name = "ApiKeyMissingError"
  }
}

function promptHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve("")
      return
    }
    process.stdout.write(prompt)
    // Best-effort input echo suppression. Bun's readline doesn't expose
    // raw mode as cleanly as Node; we set raw mode manually.
    const stdin = process.stdin as unknown as { setRawMode?: (on: boolean) => void }
    if (stdin.setRawMode) stdin.setRawMode(true)
    let buf = ""
    const onData = (chunk: Buffer) => {
      const s = chunk.toString("utf8")
      for (const ch of s) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.removeListener("data", onData)
          if (stdin.setRawMode) stdin.setRawMode(false)
          process.stdout.write("\n")
          resolve(buf)
          return
        }
        if (ch === "\x03") { // Ctrl+C
          process.stdin.removeListener("data", onData)
          if (stdin.setRawMode) stdin.setRawMode(false)
          process.exit(130)
        }
        if (ch === "\x7f" || ch === "\b") {
          buf = buf.slice(0, -1)
          continue
        }
        buf += ch
      }
    }
    process.stdin.resume()
    process.stdin.on("data", onData)
  })
}

/**
 * Ensures an API key is available. If missing and stdin is a TTY, prompts
 * for it and persists to config. If missing and non-TTY, throws so scripts
 * fail with a clear message instead of silently sending "" to the API.
 */
export async function ensureApiKey(): Promise<string> {
  const existing = await getApiKey()
  if (existing) return existing

  if (!process.stdin.isTTY) {
    throw new ApiKeyMissingError()
  }

  console.log(
    `\nNo Anthropic API key found.\n` +
    `It will be stored at ${configPath()} (chmod 600).\n` +
    `Get one at https://console.anthropic.com/settings/keys`,
  )
  const key = (await promptHidden("API key (input hidden): ")).trim()
  if (!key) throw new ApiKeyMissingError()
  await setApiKey(key)
  // Also set on the current process so the in-flight run picks it up.
  process.env.ANTHROPIC_API_KEY = key
  return key
}

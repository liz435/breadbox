// ── User config (~/.dreamer/config.json) — CLI surface ───────────────────
//
// The disk-config layer (loadConfig/saveConfig/getApiKey/setApiKey/...) now
// lives in @dreamer/api/config so the API server can share it without a
// circular dependency. This module re-exports it and adds the CLI-only,
// TTY-driven prompt path (ensureApiKey) on top.

import { configPath } from "@dreamer/api/paths"
import { getApiKey, setApiKey } from "@dreamer/api/config"

export {
  configSchema,
  type Config,
  loadConfig,
  saveConfig,
  getApiKey,
  setApiKey,
  clearApiKey,
} from "@dreamer/api/config"

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

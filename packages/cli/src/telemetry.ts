// ── Telemetry (opt-in) ──────────────────────────────────────────────────
//
// Off by default. Explicit prompt on first run. Easy to disable.
// Never collects prompts, project contents, API keys, or file paths beyond
// OS/arch. The only identifier is an anonymous installId (UUID) generated
// at opt-in time.
//
// Transport: POST https://telemetry.breadbox.dev/v1/events with a JSON body.
// Failures are silently dropped — telemetry must never affect user actions.
//
// Events are batched in memory and flushed on exit or every 5 minutes,
// whichever comes first. `dreamer telemetry preview` prints the queue so
// users can see exactly what would be sent before opting in.

import { CLI_VERSION, PLATFORM } from "./version"
import { loadConfig, saveConfig } from "./config"

const DEFAULT_ENDPOINT = "https://telemetry.breadbox.dev/v1/events"
const FLUSH_INTERVAL_MS = 5 * 60 * 1000

export type TelemetryEvent = {
  ts: string
  type: "cli.subcommand" | "cli.error" | "cli.install" | "cli.upgrade"
  subcommand?: string
  errorName?: string
  errorCode?: number
  version: string
  platform: string
  installId: string
}

const queue: TelemetryEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let shutdownHooked = false

async function getInstallId(): Promise<string | null> {
  const config = await loadConfig()
  return config.telemetry?.installId ?? null
}

async function ensureInstallId(): Promise<string> {
  const existing = await getInstallId()
  if (existing) return existing
  const id = crypto.randomUUID()
  const config = await loadConfig()
  await saveConfig({
    ...config,
    telemetry: { ...config.telemetry, installId: id },
  })
  return id
}

export async function isEnabled(): Promise<boolean> {
  const config = await loadConfig()
  return config.telemetry?.enabled === true
}

export async function enable(): Promise<void> {
  const config = await loadConfig()
  const installId = config.telemetry?.installId ?? crypto.randomUUID()
  await saveConfig({
    ...config,
    telemetry: { enabled: true, installId },
  })
}

export async function disable(): Promise<void> {
  const config = await loadConfig()
  await saveConfig({
    ...config,
    telemetry: { ...config.telemetry, enabled: false },
  })
}

/**
 * Prompt the user on first run. Returns true if they opted in.
 * Only prompts on TTY stdin; silent no-op otherwise.
 */
export async function promptFirstRun(): Promise<boolean> {
  const config = await loadConfig()
  // Already decided (either way)
  if (config.telemetry?.enabled !== undefined) return config.telemetry.enabled === true
  if (!process.stdin.isTTY) return false

  console.log("")
  console.log("Breadbox can send anonymous usage data to help improve the tool.")
  console.log("We collect: CLI version, platform, subcommand run, error codes.")
  console.log("We never collect: prompts, project contents, API keys, file paths.")
  console.log("You can change this anytime with `dreamer telemetry enable|disable`.")
  process.stdout.write("Enable anonymous telemetry? [y/N] ")

  return await new Promise<boolean>((resolve) => {
    const onData = async (chunk: Buffer) => {
      process.stdin.removeListener("data", onData)
      const answer = chunk.toString().trim().toLowerCase()
      const yes = answer === "y" || answer === "yes"
      if (yes) await enable()
      else await disable()
      resolve(yes)
    }
    process.stdin.resume()
    process.stdin.once("data", onData)
  })
}

export async function record(event: Omit<TelemetryEvent, "ts" | "version" | "platform" | "installId">): Promise<void> {
  if (!(await isEnabled())) return
  const installId = await ensureInstallId()
  queue.push({
    ...event,
    ts: new Date().toISOString(),
    version: CLI_VERSION,
    platform: PLATFORM,
    installId,
  })
  ensureFlushHooks()
}

function ensureFlushHooks(): void {
  if (!shutdownHooked) {
    shutdownHooked = true
    const flushOnExit = () => { void flush() }
    process.on("beforeExit", flushOnExit)
    process.on("SIGINT",  flushOnExit)
    process.on("SIGTERM", flushOnExit)
  }
  if (!flushTimer) {
    flushTimer = setInterval(() => { void flush() }, FLUSH_INTERVAL_MS)
    // Don't keep the event loop alive just for telemetry
    if (typeof (flushTimer as unknown as { unref?: () => void }).unref === "function") {
      (flushTimer as unknown as { unref: () => void }).unref()
    }
  }
}

export async function flush(): Promise<void> {
  if (queue.length === 0) return
  const endpoint = process.env.BREADBOX_TELEMETRY_ENDPOINT ?? DEFAULT_ENDPOINT
  const batch = queue.splice(0, queue.length)
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: batch }),
      // Short timeout — never block exit for more than 2s
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    // silent
  }
}

export function preview(): TelemetryEvent[] {
  return [...queue]
}

export async function status(): Promise<{ enabled: boolean; installId: string | null; queueSize: number }> {
  return {
    enabled: await isEnabled(),
    installId: await getInstallId(),
    queueSize: queue.length,
  }
}

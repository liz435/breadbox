// ── Crash reporter ──────────────────────────────────────────────────────
//
// On uncaughtException / unhandledRejection, dumps a redacted JSON report
// to ~/.dreamer/crashes/<ts>-<hash>.json so users can file bug reports.
//
// Redactions:
//   - ANTHROPIC_API_KEY (value + any matching "sk-ant-..." substrings)
//   - home-directory prefixes → "~"
//
// Registered via installCrashReporter() at CLI entry.

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, statSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { crashesDir } from "@dreamer/api/paths"
import { CLI_VERSION, PLATFORM } from "./version"

export type CrashReport = {
  timestamp: string
  dreamerVersion: string
  platform: string
  command: string
  error: { name: string; message: string; stack?: string } | { raw: string }
  recentLogTail?: string[]
}

const home = homedir()
const apiKeyPattern = /sk-ant-[A-Za-z0-9_-]+/g

function redact(s: string): string {
  let out = s
  if (home) {
    // Replace absolute home path with ~ — works on both / and \ OSes.
    const escapedHome = home.replace(/[\\]/g, "\\\\")
    out = out.replace(new RegExp(escapedHome, "g"), "~")
  }
  out = out.replace(apiKeyPattern, "sk-ant-<redacted>")
  const envKey = process.env.ANTHROPIC_API_KEY
  if (envKey && envKey.length > 8) {
    out = out.split(envKey).join("<REDACTED_API_KEY>")
  }
  return out
}

function redactReport(r: CrashReport): CrashReport {
  const err = r.error
  const redactedError: CrashReport["error"] =
    "name" in err
      ? { name: err.name, message: redact(err.message), stack: err.stack ? redact(err.stack) : undefined }
      : { raw: redact(err.raw) }
  return {
    ...r,
    error: redactedError,
    recentLogTail: r.recentLogTail?.map(redact),
  }
}

function writeCrash(err: unknown): string | null {
  try {
    const dir = crashesDir()
    mkdirSync(dir, { recursive: true })

    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    const hash = Math.random().toString(36).slice(2, 8)
    const filename = `${ts}-${hash}.json`
    const filepath = join(dir, filename)

    const report: CrashReport = {
      timestamp: new Date().toISOString(),
      dreamerVersion: CLI_VERSION,
      platform: PLATFORM,
      command: process.argv.slice(2).join(" "),
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : { raw: String(err) },
    }

    writeFileSync(filepath, JSON.stringify(redactReport(report), null, 2))
    return filepath
  } catch {
    return null
  }
}

export function installCrashReporter(): void {
  const emit = (err: unknown) => {
    const path = writeCrash(err)
    if (path) {
      // Note: console.error because stderr is unbuffered; reader gets it
      // before the process exits.
      console.error(
        `\n\x1b[31mDreamer crashed.\x1b[0m Crash report written to ${path}\n` +
        `Please include it if filing a bug at https://github.com/liz435/dreamer/issues\n`,
      )
    }
  }

  // Only register once
  const marker = Symbol.for("dreamer.crash-reporter.installed")
  const g = globalThis as unknown as Record<symbol, unknown>
  if (g[marker]) return
  g[marker] = true

  process.on("uncaughtException", (err) => {
    emit(err)
    process.exit(70) // EX_SOFTWARE
  })
  process.on("unhandledRejection", (reason) => {
    emit(reason)
    // Don't exit on unhandledRejection — log and let Node's default handling
    // (which may be to crash in future Node versions) take over.
  })
}

// ── Inspection helpers ───────────────────────────────────────────────────

export function listCrashes(): Array<{ file: string; path: string; size: number; mtime: Date }> {
  const dir = crashesDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const path = join(dir, f)
      const stat = statSync(path)
      return { file: f, path, size: stat.size, mtime: stat.mtime }
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
}

export function readCrash(file: string): CrashReport | null {
  const path = file.includes("/") || file.includes("\\") ? file : join(crashesDir(), file)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CrashReport
  } catch {
    return null
  }
}

export function clearCrashes(): number {
  const crashes = listCrashes()
  let n = 0
  for (const c of crashes) {
    try {
      unlinkSync(c.path)
      n++
    } catch { /* best-effort */ }
  }
  return n
}

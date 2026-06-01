// ── MCP Connect Route ─────────────────────────────────────────────────────
//
// POST /api/mcp/connect   { projectId }
//
// Powers the in-app "Connect automatically" button: registers this project's
// `dreamer mcp` server with the user's local Claude clients so they don't have
// to run `claude mcp add` or hand-edit a config file.
//
//   - Claude Desktop: merges a `dreamer` entry into claude_desktop_config.json
//     (backing up any previous file). Requires a Claude Desktop restart to load.
//   - Claude Code:     best-effort `claude mcp add` when the `claude` CLI is on
//     PATH. Never fails the request — reported as a status.
//
// Local only — disabled in hosted mode, where the server has no access to the
// user's machine (and the MCP is a local-process feature anyway).

import { Elysia } from "elysia"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir, platform } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { createLogger } from "../logger"
import { IS_HOSTED } from "../env"

const log = createLogger("mcp-connect")

type McpServerConfig = {
  command: string
  args: string[]
  env?: Record<string, string>
}

// Resolve the command Claude should run to launch the MCP server, pointed at
// `projectId`. Correct across the three ways Dreamer runs:
//   - compiled `dreamer` binary (installed CLI / desktop sidecar) → the exe
//   - dev (`bun` against source)                                  → bun + CLI entry
//   - otherwise                                                   → `dreamer` on PATH
function resolveMcpServerConfig(projectId: string): McpServerConfig {
  const exe = process.execPath
  const projArgs = ["--project", projectId, "mcp"]
  // Carry a non-default DREAMER_HOME through so the Claude-spawned MCP process
  // reads the same project store the running app uses.
  const env = process.env.DREAMER_HOME
    ? { DREAMER_HOME: process.env.DREAMER_HOME }
    : undefined

  if (basename(exe).toLowerCase().includes("dreamer")) {
    return { command: exe, args: projArgs, env }
  }
  const cliEntry = resolve(import.meta.dir, "../../../cli/src/index.ts")
  if (existsSync(cliEntry)) {
    return { command: exe, args: [cliEntry, ...projArgs], env }
  }
  return { command: "dreamer", args: projArgs, env }
}

function claudeDesktopConfigPath(): string {
  const home = homedir()
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    case "win32":
      return join(
        process.env.APPDATA ?? join(home, "AppData", "Roaming"),
        "Claude",
        "claude_desktop_config.json"
      )
    default:
      return join(home, ".config", "Claude", "claude_desktop_config.json")
  }
}

type DesktopResult =
  | { status: "written"; path: string; backedUp: boolean }
  | { status: "not_installed"; path: string }
  | { status: "error"; path: string; error: string }

function writeClaudeDesktopConfig(server: McpServerConfig): DesktopResult {
  const path = claudeDesktopConfigPath()
  // No Claude app-support dir → Claude Desktop isn't installed; don't create a
  // phantom config in a directory the app will never read.
  if (!existsSync(dirname(path))) return { status: "not_installed", path }

  try {
    let config: Record<string, unknown> = {}
    let backedUp = false
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf8")
      writeFileSync(`${path}.dreamer.bak`, raw)
      backedUp = true
      try {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === "object") config = parsed as Record<string, unknown>
      } catch {
        // Malformed existing config — we've backed it up; start fresh.
      }
    }

    const servers =
      config.mcpServers && typeof config.mcpServers === "object"
        ? (config.mcpServers as Record<string, unknown>)
        : {}
    servers.dreamer = {
      command: server.command,
      args: server.args,
      ...(server.env ? { env: server.env } : {}),
    }
    config.mcpServers = servers

    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)
    return { status: "written", path, backedUp }
  } catch (err) {
    return { status: "error", path, error: err instanceof Error ? err.message : String(err) }
  }
}

type CodeResult =
  | { status: "added" }
  | { status: "exists" }
  | { status: "unavailable" }
  | { status: "error"; error: string }

function addToClaudeCode(server: McpServerConfig): CodeResult {
  const claude = Bun.which("claude")
  if (!claude) return { status: "unavailable" }

  const envArgs = server.env
    ? Object.entries(server.env).flatMap(([k, v]) => ["--env", `${k}=${v}`])
    : []

  try {
    // Remove any existing entry first so re-connecting updates the project id
    // (`claude mcp add` errors on a duplicate name). Harmless if absent.
    Bun.spawnSync([claude, "mcp", "remove", "--scope", "user", "dreamer"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const proc = Bun.spawnSync(
      [claude, "mcp", "add", "--scope", "user", ...envArgs, "dreamer", "--", server.command, ...server.args],
      { stdout: "pipe", stderr: "pipe" }
    )
    if (proc.exitCode === 0) return { status: "added" }
    const stderr = proc.stderr.toString()
    if (/already exists/i.test(stderr)) return { status: "exists" }
    return { status: "error", error: stderr.trim() || `exit ${proc.exitCode}` }
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) }
  }
}

export const mcpConnectRoutes = new Elysia().post("/api/mcp/connect", ({ body, set }) => {
  if (IS_HOSTED) {
    set.status = 403
    return { ok: false, error: "Auto-connect is only available when running Dreamer locally." }
  }

  const projectId = (body as { projectId?: unknown } | null)?.projectId
  if (typeof projectId !== "string" || projectId.length === 0) {
    set.status = 400
    return { ok: false, error: "projectId is required" }
  }

  const server = resolveMcpServerConfig(projectId)
  const claudeDesktop = writeClaudeDesktopConfig(server)
  const claudeCode = addToClaudeCode(server)

  log.info(
    `connect ${projectId} — desktop:${claudeDesktop.status} code:${claudeCode.status} cmd:${server.command}`
  )

  return {
    ok: true,
    command: server.command,
    args: server.args,
    claudeDesktop,
    claudeCode,
    needsRestart: claudeDesktop.status === "written",
  }
})

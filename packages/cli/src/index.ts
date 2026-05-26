#!/usr/bin/env bun

import { parseArgs, CliParseError, HELP_TEXT, type Command } from "./cli-args"
import {
  createProject,
  loadProject,
  listProjects,
  listScenes,
  printBoardSummary,
  printSketch,
  AmbiguousSceneError,
  type ProjectState,
} from "./project-manager"
import { startRepl } from "./repl"
import { runAgent, AgentAbortedError } from "./runner"
import { createRenderer, printTokenUsage } from "./renderer"
import { compileSketch, flashSketch, listPorts } from "./compile-flash"
import { VersionConflictError, OpValidationError } from "@dreamer/api/db/adapters/file/project-repo"
import { resolveArduinoCli, ensureArduinoCliCore, ArduinoCliMissingError } from "@dreamer/api/toolchain"
import { logsDir, configPath } from "@dreamer/api/paths"
import { ZodError } from "zod"
import { CLI_VERSION, PLATFORM } from "./version"
import { installCrashReporter, listCrashes, readCrash, clearCrashes } from "./crash-reporter"
import * as telemetry from "./telemetry"
import * as selfUpdate from "./self-update"
import { loadConfig, saveConfig, setApiKey, clearApiKey, ensureApiKey, ApiKeyMissingError } from "./config"
import { followLogFile } from "./log-follow"
import { handleDiagramApply, handleDiagramValidate, DiagramCliError } from "./diagram-cli"
import { recordCliErrorAndFlush } from "./telemetry-reporting"
import { join } from "path"
import { existsSync, readFileSync } from "fs"

// Install crash reporter ASAP so even early-boot errors get captured.
installCrashReporter()

function classifyExitCode(err: unknown): number {
  if (err instanceof AgentAbortedError) return 130 // 128 + SIGINT
  if (err instanceof CliParseError) return 2
  if (err instanceof ApiKeyMissingError) return 2
  if (err instanceof ArduinoCliMissingError) return 2
  if (err instanceof DiagramCliError) return err.exitCode
  if (err instanceof ZodError || err instanceof OpValidationError || err instanceof AmbiguousSceneError) return 2
  if (err instanceof VersionConflictError) return 1
  if (err instanceof Error) return 1
  return 70 // EX_SOFTWARE: unexpected non-Error throw
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message
  return String(err)
}

async function resolveState(
  projectId: string | null,
  sceneId: string | null,
): Promise<ProjectState> {
  if (projectId) {
    const loaded = await loadProject(projectId, sceneId)
    if (!loaded) {
      console.error(`Project not found: ${projectId}`)
      process.exit(1)
    }
    return loaded
  }
  return createProject()
}

async function handleConfig(cmd: Command & { kind: "config" }): Promise<number> {
  if (cmd.subcommand === "path") {
    console.log(configPath())
    return 0
  }
  if (cmd.subcommand === "list") {
    const config = await loadConfig()
    console.log(JSON.stringify(config, null, 2))
    return 0
  }
  if (cmd.subcommand === "get") {
    const config = await loadConfig()
    if (cmd.key === "anthropic-key") {
      console.log(config.anthropic?.apiKey ?? "")
      return 0
    }
    if (cmd.key === "telemetry") {
      console.log(String(config.telemetry?.enabled ?? false))
      return 0
    }
    if (cmd.key === "updates-channel") {
      console.log(config.updates?.channel ?? "stable")
      return 0
    }
    console.error(`Unknown config key: ${cmd.key}`)
    return 2
  }
  if (cmd.subcommand === "set") {
    if (cmd.key === "anthropic-key" && cmd.value) {
      await setApiKey(cmd.value)
      console.log(`API key saved to ${configPath()}`)
      return 0
    }
    if (cmd.key === "updates-channel" && (cmd.value === "stable" || cmd.value === "beta")) {
      await selfUpdate.setUpdateChannel(cmd.value)
      console.log(`updates channel set to ${cmd.value}`)
      return 0
    }
    if (cmd.key === "telemetry" && (cmd.value === "true" || cmd.value === "false")) {
      if (cmd.value === "true") await telemetry.enable()
      else await telemetry.disable()
      console.log(`telemetry ${cmd.value === "true" ? "enabled" : "disabled"}`)
      return 0
    }
    console.error(`Unknown config key or invalid value for ${cmd.key}`)
    return 2
  }
  if (cmd.subcommand === "unset") {
    if (cmd.key === "anthropic-key") {
      await clearApiKey()
      console.log(`API key cleared`)
      return 0
    }
    console.error(`Cannot unset ${cmd.key}`)
    return 2
  }
  return 2
}

async function handleLogs(cmd: Command & { kind: "logs" }): Promise<number> {
  const logFile = cmd.runId
    ? join(logsDir(), `${cmd.runId}.log`)
    : join(logsDir(), "dreamer.log")
  if (!existsSync(logFile)) {
    console.error(`No log file at ${logFile}`)
    return 1
  }
  if (!cmd.follow) {
    process.stdout.write(readFileSync(logFile, "utf8"))
    return 0
  }
  // --follow: in-process cross-platform log follower
  await followLogFile(logFile)
  return 0
}

async function handleCrash(cmd: Command & { kind: "crash" }): Promise<number> {
  if (cmd.subcommand === "list") {
    const crashes = listCrashes()
    if (crashes.length === 0) {
      console.log("No crash reports.")
      return 0
    }
    for (const c of crashes) {
      console.log(`${c.file}  ${c.mtime.toISOString()}  ${c.size} bytes`)
    }
    return 0
  }
  if (cmd.subcommand === "view" && cmd.arg) {
    const report = readCrash(cmd.arg)
    if (!report) {
      console.error(`Crash not found: ${cmd.arg}`)
      return 1
    }
    console.log(JSON.stringify(report, null, 2))
    return 0
  }
  if (cmd.subcommand === "clear") {
    const n = clearCrashes()
    console.log(`Removed ${n} crash report(s).`)
    return 0
  }
  return 2
}

async function handleTelemetry(cmd: Command & { kind: "telemetry" }): Promise<number> {
  if (cmd.subcommand === "enable") {
    await telemetry.enable()
    console.log("Telemetry enabled.")
    return 0
  }
  if (cmd.subcommand === "disable") {
    await telemetry.disable()
    console.log("Telemetry disabled.")
    return 0
  }
  if (cmd.subcommand === "status") {
    const s = await telemetry.status()
    console.log(JSON.stringify(s, null, 2))
    return 0
  }
  if (cmd.subcommand === "preview") {
    const events = telemetry.preview()
    if (events.length === 0) console.log("(no queued events)")
    else console.log(JSON.stringify(events, null, 2))
    return 0
  }
  return 2
}

async function handleUpgrade(cmd: Command & { kind: "upgrade" }): Promise<number> {
  const check = await selfUpdate.checkForUpdate()
  if (check.status === "current") {
    console.log(`dreamer ${check.version} is up to date.`)
    return 0
  }
  if (check.status === "blocked") {
    console.error(`Upgrade blocked: ${check.reason}`)
    return 1
  }
  console.log(`Update available: ${check.currentVersion} → ${check.latestVersion}`)
  if (check.releaseNotes) {
    console.log("")
    console.log(check.releaseNotes.slice(0, 400))
    if (check.releaseNotes.length > 400) console.log("...")
  }
  if (cmd.check) return 0
  console.log("")
  console.log("Downloading...")
  const result = await selfUpdate.applyUpdate(check.url)
  console.log(result.message)
  return result.ok ? 0 : 1
}

async function handleSetup(): Promise<number> {
  console.log("Setting up Dreamer...")
  console.log("")
  console.log("1. Installing arduino-cli...")
  try {
    const cliPath = await resolveArduinoCli()
    console.log(`   arduino-cli: ${cliPath}`)
  } catch (err) {
    console.error(`   failed: ${formatError(err)}`)
    return 1
  }
  console.log("")
  console.log("2. Installing Arduino AVR core (~200MB, one-time)...")
  try {
    await ensureArduinoCliCore("arduino:avr")
    console.log("   AVR core ready")
  } catch (err) {
    console.error(`   failed: ${formatError(err)}`)
    return 1
  }
  console.log("")
  console.log("3. Anthropic API key...")
  try {
    await ensureApiKey()
    console.log("   API key set")
  } catch (err) {
    console.error(`   failed: ${formatError(err)}`)
    return 1
  }
  console.log("")
  console.log("4. Telemetry preference...")
  await telemetry.promptFirstRun()
  console.log("")
  console.log("\x1b[32mSetup complete.\x1b[0m Try `dreamer run \"add an LED on pin 13\"`.")
  return 0
}

async function dispatch(command: Command, projectId: string | null, sceneId: string | null): Promise<number> {
  // Record telemetry for this invocation (no-op if disabled).
  void telemetry.record({ type: "cli.subcommand", subcommand: command.kind })

  switch (command.kind) {
    case "help": {
      console.log(HELP_TEXT)
      return 0
    }

    case "version": {
      console.log(`dreamer ${CLI_VERSION} (${PLATFORM})`)
      return 0
    }

    case "repl": {
      const state = await resolveState(projectId, sceneId)
      await startRepl(state)
      return 0
    }

    case "headed": {
      // CLI mode: single-tenant, file-backed, no Supabase. Pin these env
      // vars before the API modules import — auth-plugin reads them at
      // import time to pick cli vs supabase middleware.
      process.env.DREAMER_MODE = "cli"
      process.env.DREAMER_DEV_SKIP_AUTH = "1"
      const state = await resolveState(projectId, sceneId)
      const { startHeadedMode } = await import("./headed")
      await startHeadedMode()
      await startRepl(state)
      return 0
    }

    case "watch": {
      const state = await resolveState(projectId, sceneId)
      const { startWatchMode } = await import("./watch")
      await startWatchMode(state, command.port)
      return 0
    }

    case "run": {
      const state = await resolveState(projectId, sceneId)
      const render = createRenderer()
      const result = await runAgent(state, command.prompt, `cli-once-${Date.now()}`, render)
      printTokenUsage(result.tokenUsage, result.overhead)
      return 0
    }

    case "compile": {
      const state = await resolveState(projectId, sceneId)
      console.log("Compiling...")
      const result = await compileSketch(state.project)
      if (!result.success) {
        console.error(`\x1b[31mCompilation failed:\x1b[0m ${result.error}`)
        return 1
      }
      console.log("\x1b[32mCompilation succeeded.\x1b[0m")
      if (result.sizeInfo) {
        console.log(`Flash: ${result.sizeInfo.flashUsed}/${result.sizeInfo.flashMax} bytes (${result.sizeInfo.flashPercent}%)`)
        console.log(`RAM:   ${result.sizeInfo.ramUsed}/${result.sizeInfo.ramMax} bytes (${result.sizeInfo.ramPercent}%)`)
      }
      return 0
    }

    case "flash": {
      if (!command.port) {
        const ports = await listPorts()
        console.error("Usage: dreamer flash <port>  (or --port <port>)")
        if (ports.length > 0) {
          console.error("Available ports:")
          for (const p of ports) console.error(`  ${p}`)
        } else {
          console.error("(no serial ports detected)")
        }
        return 2
      }
      const state = await resolveState(projectId, sceneId)
      console.log(`Compiling and flashing to ${command.port}...`)
      const result = await flashSketch(state.project, command.port)
      if (!result.success) {
        console.error(`\x1b[31mFlash failed:\x1b[0m ${result.error}`)
        return 1
      }
      console.log("\x1b[32mFlash succeeded.\x1b[0m")
      return 0
    }

    case "ports": {
      const ports = await listPorts()
      if (ports.length === 0) {
        console.log("No serial ports detected.")
        return 0
      }
      for (const p of ports) console.log(p)
      return 0
    }

    case "board": {
      const state = await resolveState(projectId, sceneId)
      printBoardSummary(state.project)
      return 0
    }

    case "sketch": {
      const state = await resolveState(projectId, sceneId)
      printSketch(state.project)
      return 0
    }

    case "projects": {
      await listProjects()
      return 0
    }

    case "scenes": {
      const state = await resolveState(projectId, sceneId)
      listScenes(state.project)
      return 0
    }

    case "config":    return handleConfig(command)
    case "setup":     return handleSetup()
    case "logs":      return handleLogs(command)
    case "crash":     return handleCrash(command)
    case "telemetry": return handleTelemetry(command)
    case "upgrade":   return handleUpgrade(command)
    case "diagram": {
      if (command.subcommand === "validate") {
        return handleDiagramValidate(command.file)
      }
      return handleDiagramApply(command.file, command.projectFile)
    }

    case "mcp": {
      // Lazy-import so non-mcp subcommands don't pay the SDK parse cost.
      const { runMcpServer } = await import("./mcp/server")
      await runMcpServer({ projectId })
      return 0
    }
  }
}

async function main() {
  let args
  try {
    args = parseArgs(process.argv)
  } catch (err) {
    if (err instanceof CliParseError) {
      console.error(err.message)
      process.exit(2)
    }
    throw err
  }

  try {
    const exitCode = await dispatch(args.command, args.projectId, args.sceneId)
    // Best-effort: flush any queued telemetry before exit
    await telemetry.flush()
    process.exit(exitCode)
  } catch (err) {
    if (err instanceof AmbiguousSceneError) {
      console.error(err.message)
      process.exit(2)
    }
    if (err instanceof DiagramCliError) {
      console.error(err.message)
      process.exit(err.exitCode)
    }
    await recordCliErrorAndFlush(telemetry, args.command.kind, err)
    console.error(`Error: ${formatError(err)}`)
    process.exit(classifyExitCode(err))
  }
}

main().catch((err) => {
  console.error(formatError(err))
  process.exit(classifyExitCode(err))
})

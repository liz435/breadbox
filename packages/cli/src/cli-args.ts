// Subcommand-based CLI dispatcher.
//
// Syntax: dreamer [--project <id>] [--scene <id>] <subcommand> [args...]
//
// Global flags may appear anywhere; they're consumed first. The first
// remaining positional is the subcommand; everything after is subcommand-
// specific.

export type Command =
  | { kind: "repl" }
  | { kind: "run"; prompt: string }
  | { kind: "compile" }
  | { kind: "flash"; port: string | null }
  | { kind: "ports" }
  | { kind: "board" }
  | { kind: "sketch" }
  | { kind: "projects" }
  | { kind: "scenes" }
  | { kind: "headed" }
  | { kind: "watch"; port: string | null }
  | { kind: "config"; subcommand: "get" | "set" | "unset" | "path" | "list"; key?: string; value?: string }
  | { kind: "setup" }
  | { kind: "logs"; follow: boolean; runId?: string }
  | { kind: "crash"; subcommand: "list" | "view" | "clear"; arg?: string }
  | { kind: "telemetry"; subcommand: "enable" | "disable" | "status" | "preview" }
  | { kind: "upgrade"; check: boolean }
  | { kind: "version" }
  | { kind: "help" }

export type CliArgs = {
  command: Command
  projectId: string | null
  sceneId: string | null
}

export class CliParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CliParseError"
  }
}

const SUBCOMMANDS = [
  "repl", "run", "compile", "flash", "ports", "board", "sketch",
  "projects", "scenes", "headed", "watch", "config", "setup",
  "logs", "crash", "telemetry", "upgrade", "version", "help",
] as const

function isSubcommand(s: string): s is (typeof SUBCOMMANDS)[number] {
  return (SUBCOMMANDS as readonly string[]).includes(s)
}

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2)

  let projectId: string | null = null
  let sceneId: string | null = null
  let watchPort: string | null = null
  let flashPort: string | null = null
  let follow = false
  let subcommand: string | null = null
  const rest: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--help" || arg === "-h") {
      return { command: { kind: "help" }, projectId, sceneId }
    }
    if (arg === "--version" || arg === "-v") {
      return { command: { kind: "version" }, projectId, sceneId }
    }
    if (arg === "--project" && i + 1 < args.length) {
      projectId = args[++i]
      continue
    }
    if (arg === "--scene" && i + 1 < args.length) {
      sceneId = args[++i]
      continue
    }
    if (arg === "--port" && i + 1 < args.length) {
      // --port applies to whichever subcommand consumes it (watch or flash)
      const next = args[++i]
      watchPort = next
      flashPort = next
      continue
    }
    if (arg === "--follow" || arg === "-f") {
      follow = true
      continue
    }
    if (arg === "--check") {
      // --check on upgrade: check without applying
      rest.push("--check")
      continue
    }
    if (arg.startsWith("-")) {
      throw new CliParseError(`Unknown flag: ${arg}`)
    }
    // First non-flag positional = subcommand. Rest = subcommand args.
    if (subcommand === null) subcommand = arg
    else rest.push(arg)
  }

  if (subcommand === null) return { command: { kind: "repl" }, projectId, sceneId }
  if (!isSubcommand(subcommand)) {
    throw new CliParseError(
      `Unknown subcommand: ${subcommand}. Run \`dreamer help\` for usage.`,
    )
  }

  switch (subcommand) {
    case "repl":
    case "compile":
    case "ports":
    case "board":
    case "sketch":
    case "projects":
    case "scenes":
    case "headed":
    case "setup":
    case "version":
    case "help":
      return { command: { kind: subcommand }, projectId, sceneId }

    case "run": {
      const prompt = rest.join(" ").trim()
      if (!prompt) {
        throw new CliParseError(`\`dreamer run\` requires a prompt. Example: dreamer run "add an LED on pin 13"`)
      }
      return { command: { kind: "run", prompt }, projectId, sceneId }
    }

    case "flash": {
      const port = flashPort ?? rest[0] ?? null
      return { command: { kind: "flash", port }, projectId, sceneId }
    }

    case "watch": {
      return { command: { kind: "watch", port: watchPort }, projectId, sceneId }
    }

    case "config": {
      const sub = rest[0]
      if (sub === "path" || sub === "list") {
        return { command: { kind: "config", subcommand: sub }, projectId, sceneId }
      }
      if (sub === "get" && rest[1]) {
        return { command: { kind: "config", subcommand: "get", key: rest[1] }, projectId, sceneId }
      }
      if (sub === "set" && rest[1] && rest[2]) {
        return { command: { kind: "config", subcommand: "set", key: rest[1], value: rest[2] }, projectId, sceneId }
      }
      if (sub === "unset" && rest[1]) {
        return { command: { kind: "config", subcommand: "unset", key: rest[1] }, projectId, sceneId }
      }
      throw new CliParseError(`Usage: dreamer config [path|list|get <key>|set <key> <value>|unset <key>]`)
    }

    case "logs": {
      const runIdArg = rest.find((r) => r !== "--check")
      return { command: { kind: "logs", follow, runId: runIdArg }, projectId, sceneId }
    }

    case "crash": {
      const sub = rest[0]
      if (sub === "list") return { command: { kind: "crash", subcommand: "list" }, projectId, sceneId }
      if (sub === "view" && rest[1]) return { command: { kind: "crash", subcommand: "view", arg: rest[1] }, projectId, sceneId }
      if (sub === "clear") return { command: { kind: "crash", subcommand: "clear" }, projectId, sceneId }
      throw new CliParseError(`Usage: dreamer crash [list|view <file>|clear]`)
    }

    case "telemetry": {
      const sub = rest[0]
      if (sub === "enable" || sub === "disable" || sub === "status" || sub === "preview") {
        return { command: { kind: "telemetry", subcommand: sub }, projectId, sceneId }
      }
      throw new CliParseError(`Usage: dreamer telemetry [enable|disable|status|preview]`)
    }

    case "upgrade": {
      const check = rest.includes("--check")
      return { command: { kind: "upgrade", check }, projectId, sceneId }
    }
  }
}

export const HELP_TEXT = `
dreamer — Arduino circuit builder CLI

Usage:
  dreamer [options] <subcommand> [args...]

Subcommands:
  repl                    Start interactive REPL (default)
  run "<prompt>"          Run one agent turn and exit
  compile                 Compile the current project's sketch
  flash <port>            Compile and flash to a serial port
  ports                   List connected serial ports
  board                   Print board summary
  sketch                  Print current sketch code
  projects                List all projects
  scenes                  List scenes in the current project
  headed                  Start REPL with the web UI attached
  watch [--port <port>]   Auto-compile (and flash, if --port given) on sketch changes
  setup                   Install arduino-cli + AVR core + prompt for API key
  config <op> ...         Manage config (path|list|get|set|unset)
  logs [-f] [<runId>]     Tail log file, optionally for a specific run
  crash <op> [<file>]     List/view/clear crash reports
  telemetry <op>          Manage telemetry (enable|disable|status|preview)
  upgrade [--check]       Check for or apply updates
  version                 Print CLI version
  help                    Show this message

Global options:
  --project <id>          Use an existing project
  --scene <id>            Pick a scene in a multi-scene project
  --help, -h              Show this message

REPL slash commands (inside repl / headed):
  /board /sketch /compile /flash <port> /ports
  /project list | load <id> [sceneId] | new
  /scene list | switch <id>
  /quit
`.trim()

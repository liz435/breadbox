import { createInterface } from "readline"
import { runAgent, AgentAbortedError } from "./runner"
import { createRenderer, printTokenUsage } from "./renderer"
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
import { compileSketch, flashSketch, listPorts } from "./compile-flash"

const SLASH_COMMANDS = [
  "/board",
  "/sketch",
  "/compile",
  "/flash ",
  "/ports",
  "/project list",
  "/project load ",
  "/project new",
  "/scene list",
  "/scene switch ",
  "/help",
  "/quit",
]

function completer(line: string): [string[], string] {
  if (!line.startsWith("/")) return [[], line]
  const hits = SLASH_COMMANDS.filter((c) => c.startsWith(line))
  return [hits.length > 0 ? hits : SLASH_COMMANDS, line]
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message
  return String(err)
}

export async function startRepl(initialState: ProjectState): Promise<void> {
  // Resolves when readline closes (Ctrl+D, stdin EOF, or explicit /quit).
  // We return this promise so callers can `await startRepl(...)` and block
  // until the user exits — otherwise `main()` runs straight to
  // `process.exit(0)` the moment readline is wired up, and the REPL
  // appears to flash-and-exit.
  return new Promise<void>((resolve) => {
    runRepl(initialState, resolve)
  })
}

function runRepl(initialState: ProjectState, done: () => void): void {
  const state = initialState
  const sessionId = `cli-session-${Date.now()}`
  const render = createRenderer()
  let sawError = false

  console.log()
  console.log(`\x1b[1mdreamer\x1b[0m — Arduino circuit builder`)
  console.log(`\x1b[2mProject: ${state.project.project.name} (${state.projectId})\x1b[0m`)
  console.log(`\x1b[2mType a prompt to build/modify circuits. Use /help for commands.\x1b[0m`)
  console.log()

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\x1b[36mdreamer>\x1b[0m ",
    completer,
  })

  rl.prompt()

  rl.on("line", (line) => {
    const input = line.trim()
    if (!input) {
      rl.prompt()
      return
    }

    // Pause input while processing so async handlers finish before next line
    rl.pause()

    const resume = () => {
      rl.resume()
      rl.prompt()
    }

    if (input.startsWith("/")) {
      handleSlashCommand(input, state).then(resume, (err) => {
        sawError = true
        render.onError(formatError(err))
        resume()
      })
      return
    }

    runAgent(state, input, sessionId, render).then(
      (result) => {
        printTokenUsage(result.tokenUsage, result.overhead)
        resume()
      },
      (err) => {
        if (err instanceof AgentAbortedError) {
          // User-initiated cancel — not an error, just resume the prompt
          console.log("\x1b[2m(cancelled)\x1b[0m")
          resume()
          return
        }
        sawError = true
        render.onError(formatError(err))
        resume()
      },
    )
  })

  rl.on("close", () => {
    console.log("\nBye!")
    if (sawError) process.exit(1)
    // Resolve so the awaiting main() returns and process.exit(0) runs
    // with any pending telemetry flushed.
    done()
  })
}

async function handleSlashCommand(
  input: string,
  state: ProjectState,
): Promise<void> {
  const parts = input.slice(1).split(/\s+/)
  const cmd = parts[0]
  const arg = parts.slice(1).join(" ")

  switch (cmd) {
    case "help":
      console.log(`
  \x1b[1mCommands:\x1b[0m
    /board              Print current board state
    /sketch             Print current sketch code
    /compile            Compile current sketch via arduino-cli
    /flash <port>       Compile + flash to Arduino
    /ports              List connected serial ports
    /project list       List all projects
    /project load <id>  Load a project
    /project new        Create a new project
    /scene list         List scenes in the current project
    /scene switch <id>  Switch the active scene
    /quit               Exit
`)
      break

    case "board":
      printBoardSummary(state.project)
      break

    case "sketch":
      printSketch(state.project)
      break

    case "compile": {
      console.log("  Compiling...")
      const result = await compileSketch(state.project)
      if (result.success) {
        console.log(`  \x1b[32mCompilation succeeded.\x1b[0m`)
        if (result.sizeInfo) {
          console.log(`  Flash: ${result.sizeInfo.flashUsed}/${result.sizeInfo.flashMax} bytes (${result.sizeInfo.flashPercent}%)`)
          console.log(`  RAM:   ${result.sizeInfo.ramUsed}/${result.sizeInfo.ramMax} bytes (${result.sizeInfo.ramPercent}%)`)
        }
      } else {
        console.log(`  \x1b[31mCompilation failed:\x1b[0m ${result.error}`)
      }
      break
    }

    case "flash": {
      const port = arg.trim()
      if (!port) {
        const ports = await listPorts()
        if (ports.length === 0) {
          console.log("  No serial ports detected. Usage: /flash <port>")
        } else {
          console.log("  Usage: /flash <port>")
          console.log("  Available ports:")
          for (const p of ports) {
            console.log(`    ${p}`)
          }
        }
        break
      }
      console.log(`  Compiling and flashing to ${port}...`)
      const result = await flashSketch(state.project, port)
      if (result.success) {
        console.log(`  \x1b[32mFlash succeeded!\x1b[0m`)
      } else {
        console.log(`  \x1b[31mFlash failed:\x1b[0m ${result.error}`)
      }
      break
    }

    case "ports": {
      const ports = await listPorts()
      if (ports.length === 0) {
        console.log("  No serial ports detected.")
      } else {
        console.log("  Connected ports:")
        for (const p of ports) {
          console.log(`    ${p}`)
        }
      }
      break
    }

    case "project":
      await handleProjectCommand(arg, state)
      break

    case "scene":
      await handleSceneCommand(arg, state)
      break

    case "quit":
    case "exit":
    case "q":
      console.log("Bye!")
      process.exit(0)
      break

    default:
      console.log(`  Unknown command: /${cmd}. Type /help for available commands.`)
  }
}

async function handleProjectCommand(
  arg: string,
  state: ProjectState,
): Promise<void> {
  const parts = arg.split(/\s+/)
  const subcmd = parts[0]

  switch (subcmd) {
    case "list":
      await listProjects()
      break

    case "load": {
      const id = parts[1]
      const explicitScene = parts[2] ?? null
      if (!id) {
        console.log("  Usage: /project load <id> [sceneId]")
        return
      }
      try {
        const loaded = await loadProject(id, explicitScene)
        if (!loaded) {
          console.log(`  Project ${id} not found.`)
          return
        }
        state.projectId = loaded.projectId
        state.project = loaded.project
        state.sceneId = loaded.sceneId
        console.log(`  Loaded project: ${loaded.project.project.name}`)
      } catch (err) {
        if (err instanceof AmbiguousSceneError) {
          console.log(`  ${err.message}`)
          return
        }
        throw err
      }
      break
    }

    case "new": {
      const created = await createProject()
      state.projectId = created.projectId
      state.project = created.project
      state.sceneId = created.sceneId
      console.log(`  Created project: ${created.projectId}`)
      break
    }

    default:
      console.log("  Usage: /project [list|load <id>|new]")
  }
}

async function handleSceneCommand(
  arg: string,
  state: ProjectState,
): Promise<void> {
  const parts = arg.split(/\s+/)
  const subcmd = parts[0]

  switch (subcmd) {
    case "list":
      listScenes(state.project)
      break

    case "switch": {
      const id = parts[1]
      if (!id) {
        console.log("  Usage: /scene switch <id>")
        return
      }
      if (!state.project.scenes[id]) {
        console.log(`  Scene ${id} not found.`)
        return
      }
      state.sceneId = id
      console.log(`  Switched to scene: ${state.project.scenes[id].name} (${id})`)
      break
    }

    default:
      console.log("  Usage: /scene [list|switch <id>]")
  }
}

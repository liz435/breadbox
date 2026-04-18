import { projectRepo } from "@dreamer/api/db/project-repo"
import type { ProjectFile } from "@dreamer/schemas"
import { compileSketch, flashSketch } from "./compile-flash"
import type { ProjectState } from "./project-manager"

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
}

type WatchPollerDeps = {
  state: ProjectState
  projectId: string
  flashPort: string | null
  readProject: (projectId: string) => Promise<ProjectFile | null>
  compileSketch: typeof compileSketch
  flashSketch: typeof flashSketch
  log: (message: string) => void
  error: (message: string) => void
  now: () => string
}

export function createWatchPoller(deps: WatchPollerDeps): { poll: () => Promise<void> } {
  let lastSketchHash: string | null = null

  const poll = async () => {
    try {
      const project = await deps.readProject(deps.projectId)
      if (!project) return

      const currentHash = hashSketch(project.boardState?.sketchCode ?? "")
      if (lastSketchHash !== null && currentHash === lastSketchHash) return

      lastSketchHash = currentHash
      deps.state.project = project

      const timestamp = deps.now()
      deps.log(`${C.dim}[${timestamp}]${C.reset} Sketch changed — compiling...`)

      const result = await deps.compileSketch(project)
      if (!result.success) {
        deps.log(`${C.red}  Compilation failed:${C.reset} ${result.error}`)
        return
      }

      deps.log(`${C.green}  Compiled OK${C.reset}`)
      if (result.sizeInfo) {
        deps.log(
          `${C.dim}  Flash: ${result.sizeInfo.flashUsed}/${result.sizeInfo.flashMax} (${result.sizeInfo.flashPercent}%) | RAM: ${result.sizeInfo.ramUsed}/${result.sizeInfo.ramMax} (${result.sizeInfo.ramPercent}%)${C.reset}`,
        )
      }

      if (deps.flashPort) {
        deps.log(`${C.yellow}  Flashing to ${deps.flashPort}...${C.reset}`)
        const flashResult = await deps.flashSketch(project, deps.flashPort)
        if (flashResult.success) {
          deps.log(`${C.green}  Flash OK${C.reset}`)
        } else {
          deps.log(`${C.red}  Flash failed:${C.reset} ${flashResult.error}`)
        }
      }
    } catch (err) {
      deps.error(`${C.red}  Watch error:${C.reset} ${err}`)
    }
  }

  return { poll }
}

/**
 * Watch a project's sketch code for changes. On each change:
 * 1. Re-read the project from disk
 * 2. Compile via arduino-cli
 * 3. Optionally flash to a connected board
 *
 * Polls every 2 seconds (file-watch via Bun.file stat).
 */
export async function startWatchMode(
  state: ProjectState,
  flashPort: string | null,
): Promise<void> {
  const { projectId } = state
  const pollMs = 2000

  console.log()
  console.log(`${C.bold}Watch mode${C.reset} — monitoring project ${C.cyan}${projectId}${C.reset}`)
  if (flashPort) {
    console.log(`${C.dim}Auto-flash to ${flashPort} on changes${C.reset}`)
  } else {
    console.log(`${C.dim}Auto-compile on changes (add --port to auto-flash)${C.reset}`)
  }
  console.log(`${C.dim}Press Ctrl+C to stop${C.reset}`)
  console.log()

  const { poll } = createWatchPoller({
    state,
    projectId,
    flashPort,
    readProject: (id) => projectRepo.readProject(id),
    compileSketch,
    flashSketch,
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    now: () => new Date().toLocaleTimeString(),
  })

  // Run initial compile
  await poll()

  // Poll loop
  const interval = setInterval(poll, pollMs)

  // Clean exit
  process.on("SIGINT", () => {
    clearInterval(interval)
    console.log(`\n${C.dim}Watch stopped.${C.reset}`)
    process.exit(0)
  })

  // Keep alive
  await new Promise(() => {})
}

function hashSketch(code: string): string {
  const hasher = new Bun.CryptoHasher("md5")
  hasher.update(code)
  return hasher.digest("hex")
}

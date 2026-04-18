import { projectRepo } from "@dreamer/api/db/project-repo"
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
  let lastSketchHash = hashSketch(state.project.boardState?.sketchCode ?? "")
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

  const poll = async () => {
    try {
      const project = await projectRepo.readProject(projectId)
      if (!project) return

      const currentHash = hashSketch(project.boardState?.sketchCode ?? "")
      if (currentHash === lastSketchHash) return

      lastSketchHash = currentHash
      state.project = project

      const timestamp = new Date().toLocaleTimeString()
      console.log(`${C.dim}[${timestamp}]${C.reset} Sketch changed — compiling...`)

      const result = await compileSketch(project)
      if (!result.success) {
        console.log(`${C.red}  Compilation failed:${C.reset} ${result.error}`)
        return
      }

      console.log(`${C.green}  Compiled OK${C.reset}`)
      if (result.sizeInfo) {
        console.log(
          `${C.dim}  Flash: ${result.sizeInfo.flashUsed}/${result.sizeInfo.flashMax} (${result.sizeInfo.flashPercent}%) | RAM: ${result.sizeInfo.ramUsed}/${result.sizeInfo.ramMax} (${result.sizeInfo.ramPercent}%)${C.reset}`,
        )
      }

      if (flashPort) {
        console.log(`${C.yellow}  Flashing to ${flashPort}...${C.reset}`)
        const flashResult = await flashSketch(project, flashPort)
        if (flashResult.success) {
          console.log(`${C.green}  Flash OK${C.reset}`)
        } else {
          console.log(`${C.red}  Flash failed:${C.reset} ${flashResult.error}`)
        }
      }
    } catch (err) {
      console.error(`${C.red}  Watch error:${C.reset} ${err}`)
    }
  }

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

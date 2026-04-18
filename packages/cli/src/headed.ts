import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { projectRoutes } from "@dreamer/api/routes/projects"
import { agentRunRoutes } from "@dreamer/api/routes/agent-run"
import { chatRoutes } from "@dreamer/api/routes/chat"
import { compileRoutes } from "@dreamer/api/routes/compile"
import { flashRoutes } from "@dreamer/api/routes/flash"
import { boardRoutes } from "@dreamer/api/routes/boards"
import { evalRoutes } from "@dreamer/api/routes/eval"
import { createLogger } from "@dreamer/api/logger"
import { ASSET_COUNT } from "./web-ui-manifest.generated"
import { startStaticWebUI, type StaticWebUI } from "./web-ui"

const log = createLogger("headed")

function openBrowser(url: string): void {
  try {
    if (process.platform === "darwin") {
      Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" })
    } else if (process.platform === "win32") {
      // `start` is a cmd builtin, so we invoke it through cmd. The empty
      // first argument to `start` is the window title (required when the
      // URL contains ampersands / quotes).
      Bun.spawn(["cmd", "/c", "start", "", url], { stdout: "ignore", stderr: "ignore" })
    } else {
      Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" })
    }
  } catch (err) {
    log.warn(`could not open browser: ${err}`)
  }
}

// CLI headed mode uses distinct ports from `bun run dev` so both can run
// concurrently without colliding.
// Note: use API_PORT (not PORT) — a generic PORT env is commonly set by
// other dev tools and would collide here.
const API_PORT = Number(process.env.API_PORT ?? 4112)
const APP_PORT = Number(process.env.APP_PORT ?? 3004)

/**
 * Decide whether to serve the web UI from embedded static assets or by
 * spawning Vite. Standalone binaries have ASSET_COUNT > 0; dev-from-source
 * has ASSET_COUNT = 0 (no `vite build` run) or user forces dev mode with
 * DREAMER_HEADED_MODE=dev.
 */
function resolveHeadedMode(): "static" | "dev" {
  const override = process.env.DREAMER_HEADED_MODE
  if (override === "static" || override === "dev") return override
  return ASSET_COUNT > 0 ? "static" : "dev"
}

/**
 * Start the API server in-process and launch the frontend — either from
 * embedded static assets (binary) or by spawning Vite (dev). Both paths
 * share the same in-process boardTracker, so changes in the web UI and
 * CLI are immediately visible to each other.
 */
export async function startHeadedMode(): Promise<void> {
  const mode = resolveHeadedMode()
  log.info(`headed mode: ${mode}`)

  // 1. Start Elysia API server (same setup as packages/api/src/index.ts)
  const app = new Elysia()
    .use(
      cors({
        origin: `http://localhost:${APP_PORT}`,
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type"],
      }),
    )
    .use(projectRoutes)
    .use(agentRunRoutes)
    .use(chatRoutes)
    .use(compileRoutes)
    .use(flashRoutes)
    .use(boardRoutes)
    .use(evalRoutes)
    .listen(API_PORT)

  log.info(`API server listening on http://localhost:${app.server?.port}`)

  // 2. Start the frontend
  let viteProcess: ReturnType<typeof Bun.spawn> | null = null
  let webUI: StaticWebUI | null = null

  if (mode === "static") {
    webUI = startStaticWebUI(
      APP_PORT,
      `http://localhost:${API_PORT}`,
      `http://localhost:${APP_PORT}`,
    )
  } else {
    viteProcess = Bun.spawn(
      ["bunx", "--bun", "vite", "--port", String(APP_PORT)],
      {
        cwd: `${import.meta.dir}/../../app`,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          // vite.config.ts reads ALL of these to derive the client bundle's
          // constants at build time. Passing only API_ORIGIN leaves API_PORT
          // defaulted to 4111 in the bundle, which shows up in error
          // messages even when fetches go to 4112.
          API_PORT: String(API_PORT),
          API_ORIGIN: `http://localhost:${API_PORT}`,
          APP_PORT: String(APP_PORT),
        },
      },
    )
  }

  // Give Vite (dev) a moment to boot before we open the browser.
  if (mode === "dev") {
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  const appUrl = `http://localhost:${APP_PORT}`
  log.info(`Frontend at ${appUrl}`)

  // 3. Open browser (macOS: open, Linux: xdg-open, Windows: start)
  openBrowser(appUrl)

  // Clean up on exit. In dev mode we must kill Vite and wait for it to
  // flush; in static mode we only stop our own Bun.serve instance.
  let shuttingDown = false
  const shutdown = async (signal: string, exitCode: number) => {
    if (shuttingDown) return
    shuttingDown = true
    log.info(`received ${signal}, shutting down...`)
    try {
      if (viteProcess) viteProcess.kill()
    } catch (err) {
      log.warn(`failed to kill vite: ${err}`)
    }
    try {
      if (viteProcess) {
        await Promise.race([
          viteProcess.exited,
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ])
      }
    } catch {
      // ignore
    }
    try {
      if (webUI) await webUI.stop()
    } catch (err) {
      log.warn(`failed to stop web UI: ${err}`)
    }
    try {
      await app.stop()
    } catch (err) {
      log.warn(`failed to stop API server: ${err}`)
    }
    process.exit(exitCode)
  }
  process.on("SIGINT", () => void shutdown("SIGINT", 130))
  process.on("SIGTERM", () => void shutdown("SIGTERM", 143))
}

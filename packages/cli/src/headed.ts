import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { authPlugin } from "@dreamer/api/auth/auth-plugin"
import { createLogger } from "@dreamer/api/logger"
import { adminRoutes } from "@dreamer/api/routes/admin"
import { agentRunRoutes } from "@dreamer/api/routes/agent-run"
import { authRoutes } from "@dreamer/api/routes/auth"
import { boardRoutes } from "@dreamer/api/routes/boards"
import { boardStreamRoutes } from "@dreamer/api/routes/board-stream"
import { mcpConnectRoutes } from "@dreamer/api/routes/mcp-connect"
import { capabilitiesRoutes } from "@dreamer/api/routes/capabilities"
import { chatRoutes } from "@dreamer/api/routes/chat"
import { compileRoutes } from "@dreamer/api/routes/compile"
import { configRoutes } from "@dreamer/api/routes/config"
import { evalRoutes } from "@dreamer/api/routes/eval"
import { flashRoutes } from "@dreamer/api/routes/flash"
import { libraryRoutes } from "@dreamer/api/routes/libraries"
import { customPartsRoutes } from "@dreamer/api/routes/custom-parts"
import { projectRoutes } from "@dreamer/api/routes/projects"
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

// Preferred ports. Headed mode uses distinct defaults from `bun run dev`
// (3000 / 4111) so both can run concurrently. These are only *preferences*
// now — if a port is taken (another `dreamer headed`, the Tauri desktop
// sidecar, anything) we fall back to an OS-assigned free port. The frontend
// learns the actual API port via injected runtime config, so the exact
// numbers are invisible to the user.
// Note: use API_PORT (not PORT) — a generic PORT env is commonly set by
// other dev tools and would collide here.
const API_PORT_PREF = Number(process.env.API_PORT ?? 4112)
const APP_PORT_PREF = Number(process.env.APP_PORT ?? 3004)
// Bind API to loopback so LAN peers and other local processes can't
// reach /api/*. See `BREADBOX_BIND` in packages/api/src/env.ts.
const API_HOST = "127.0.0.1"

// Probe a port on loopback: resolve to the actual bound port if free, or
// null if taken. Passing 0 asks the OS for any free port.
//
// We probe with Bun.serve — the SAME bind mechanism the real API/UI servers
// use — so a port we call "free" is actually bindable by them. A node:net
// probe disagrees with Bun.serve on macOS about already-listening ports and
// would hand back a port that then fails to bind. We await stop() so the port
// is released before the caller rebinds it.
async function probePort(port: number): Promise<number | null> {
  try {
    const srv = Bun.serve({
      port,
      hostname: API_HOST,
      fetch: () => new Response(null),
    })
    const actual = srv.port
    await srv.stop(true)
    return actual ?? null
  } catch {
    return null
  }
}

// Prefer `preferred`; if it's taken, take any OS-assigned free port. There's
// a tiny TOCTOU window between probing and the real bind, but it's on
// single-user loopback and the established get-port pattern — acceptable.
async function getFreePort(preferred: number): Promise<number> {
  return (await probePort(preferred)) ?? (await probePort(0)) ?? 0
}

/**
 * Decide whether to serve the web UI from embedded static assets or by
 * spawning Vite. Standalone binaries have ASSET_COUNT > 0; dev-from-source
 * has ASSET_COUNT = 0 (no `vite build` run) or user forces dev mode with
 * BREADBOX_HEADED_MODE=dev.
 */
function resolveHeadedMode(): "static" | "dev" {
  const override = process.env.BREADBOX_HEADED_MODE
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

  // Allocate ports up front (prefer the defaults, fall back to free ports).
  // Keep them distinct in the rare case both fall back to OS-assigned ports.
  const appPort = await getFreePort(APP_PORT_PREF)
  let apiPort = await getFreePort(API_PORT_PREF)
  if (apiPort === appPort) apiPort = await getFreePort(0)
  const appOrigin = `http://localhost:${appPort}`
  const apiOrigin = `http://localhost:${apiPort}`

  // 1. Start Elysia API server. Mirrors packages/api/src/index.ts in
  //    plugin order — authPlugin MUST come before any route plugin so the
  //    global derive hook is registered first. CORS is scoped to the actual
  //    web UI origin only.
  const app = new Elysia()
    .use(
      cors({
        origin: [
          appOrigin,
          `http://127.0.0.1:${appPort}`,
        ],
        credentials: true,
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type"],
      }),
    )
    .use(authPlugin)
    .use(authRoutes)
    .use(configRoutes)
    .use(adminRoutes)
    .use(projectRoutes)
    .use(agentRunRoutes)
    .use(chatRoutes)
    .use(compileRoutes)
    .use(flashRoutes)
    .use(boardRoutes)
    .use(boardStreamRoutes)
    .use(mcpConnectRoutes)
    .use(evalRoutes)
    .use(libraryRoutes)
    .use(customPartsRoutes)
    .use(capabilitiesRoutes)
    .listen({ port: apiPort, hostname: API_HOST })

  log.info(`API server listening on http://${API_HOST}:${app.server?.port}`)

  // 2. Start the frontend
  let viteProcess: ReturnType<typeof Bun.spawn> | null = null
  let webUI: StaticWebUI | null = null

  if (mode === "static") {
    webUI = startStaticWebUI(appPort, apiOrigin, appOrigin)
  } else {
    viteProcess = Bun.spawn(
      ["bunx", "--bun", "vite", "--port", String(appPort)],
      {
        cwd: `${import.meta.dir}/../../app`,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          // vite.config.ts reads ALL of these to derive the client bundle's
          // constants at build time + the dev proxy target. Passing only
          // API_ORIGIN leaves API_PORT defaulted to 4111 in the bundle.
          API_PORT: String(apiPort),
          API_ORIGIN: apiOrigin,
          APP_PORT: String(appPort),
        },
      },
    )
  }

  // Give Vite (dev) a moment to boot before we open the browser.
  if (mode === "dev") {
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  // 3. CLI mode is single-tenant — the auth middleware short-circuits to
  //    a fixed local user id (no bootstrap nonce, no GitHub OAuth). The
  //    frontend just renders the app and starts hitting /api.
  const appUrl = appOrigin
  log.info(`Frontend at ${appUrl}`)

  const banner =
    `\n` +
    `─── Open in browser ───────────────────────────────────────\n` +
    `  ${appUrl}\n` +
    `───────────────────────────────────────────────────────────\n`
  process.stdout.write(banner)

  // 4. Auto-open the browser unless we're in a headless env (CI,
  //    non-TTY) or explicitly told not to. BREADBOX_NO_OPEN=1 is set by the
  //    Tauri desktop shell (packages/desktop), which spawns this binary as
  //    a sidecar and renders the UI in its own native window — opening a
  //    browser tab on top of that would be wrong. The open helpers are all
  //    fire-and-forget; a failed spawn just means the user copies the URL.
  const headless =
    process.env.BREADBOX_NO_OPEN === "1" ||
    process.env.CI === "true" ||
    !process.stdout.isTTY
  if (!headless) openBrowser(appUrl)

  // When running as the Tauri desktop sidecar (BREADBOX_NO_OPEN=1), emit a
  // machine-readable marker so the native shell knows which URL to point its
  // window at — the port may be OS-assigned, not the 3004 default. One line,
  // easy to grep from the child's stdout.
  if (process.env.BREADBOX_NO_OPEN === "1") {
    process.stdout.write(`BREADBOX_URL ${appUrl}\n`)
  }

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

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { createLogger } from "./logger";
import { projectRoutes } from "./routes/projects";
import { agentRunRoutes } from "./routes/agent-run";
import { chatRoutes, awaitPendingSummaries } from "./routes/chat";
import { compileRoutes } from "./routes/compile";
import { flashRoutes } from "./routes/flash";
import { boardRoutes } from "./routes/boards";
import { evalRoutes } from "./routes/eval";
import { libraryRoutes } from "./routes/libraries";
import { capabilitiesRoutes } from "./routes/capabilities";
import { createWebUiStatic } from "./routes/web-ui-static";
import { stopWorker } from "./serial/serialport-bridge";
import { APP_ORIGIN, API_PORT as _API_PORT } from "@dreamer/config";
import { IS_HOSTED } from "./env";

const API_PORT = Number(process.env.PORT ?? _API_PORT);

const log = createLogger("server");

// Static web UI (hosted deployments). Plugin registers /, /index.html;
// handleNotFound serves assets + SPA fallback for unmatched routes.
// Dev mode keeps Vite on a separate port — `plugin` is a no-op and
// `handleNotFound` returns undefined so the app behaves unchanged.
const { plugin: staticWebUi, handleNotFound } = createWebUiStatic();

const app = new Elysia()
  .use(
    cors({
      origin: IS_HOSTED ? true : APP_ORIGIN,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    })
  )
  .use(projectRoutes)
  .use(agentRunRoutes)
  .use(chatRoutes)
  .use(compileRoutes)
  .use(flashRoutes)
  .use(boardRoutes)
  .use(evalRoutes)
  .use(libraryRoutes)
  .use(capabilitiesRoutes)
  .use(staticWebUi)
  .onError(({ code, request }) => {
    // Elysia's default NOT_FOUND response body is literally "NOT_FOUND",
    // which is what users see when an SPA client route falls through the
    // router. Intercept it and serve index.html / a static file instead.
    if (code !== "NOT_FOUND") return
    const url = new URL(request.url)
    return handleNotFound(url.pathname)
  })
  .listen({ port: API_PORT, hostname: "0.0.0.0" });

log.info(`listening on http://0.0.0.0:${app.server?.port}${IS_HOSTED ? " (hosted, serving web UI)" : ""}`);

// ── Graceful shutdown ───────────────────────────────────────────────────────
// Railway sends SIGTERM on redeploy with ~10s before SIGKILL. We stop
// accepting new connections, drain in-flight serial monitors and
// background summary tasks, then let the process exit.

const SHUTDOWN_DEADLINE_MS = 9_000
let shuttingDown = false

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  log.info(`received ${signal} — shutting down`)

  // Don't accept new connections; let in-flight ones finish.
  try {
    app.server?.stop(false)
  } catch (err) {
    log.warn(`server.stop failed: ${err instanceof Error ? err.message : err}`)
  }

  // Forced-exit safety net in case a drain task wedges past the deadline.
  const hardKill = setTimeout(() => {
    log.warn("shutdown deadline elapsed — force-exiting")
    process.exit(1)
  }, SHUTDOWN_DEADLINE_MS)
  hardKill.unref?.()

  try {
    stopWorker()
  } catch (err) {
    log.warn(`stopWorker failed: ${err instanceof Error ? err.message : err}`)
  }

  await awaitPendingSummaries(SHUTDOWN_DEADLINE_MS - 500)

  log.info("shutdown complete")
  process.exit(0)
}

process.on("SIGTERM", () => { void shutdown("SIGTERM") })
process.on("SIGINT", () => { void shutdown("SIGINT") })

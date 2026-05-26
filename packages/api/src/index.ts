// ── Secret lockdown (must be first) ─────────────────────────────────────
// Side-effect import: captures ANTHROPIC_API_KEY into a module-local and
// deletes it from process.env before any agent/tool module loads.
// (build-trigger: redeploy after Dockerfile --frozen-lockfile fix)
import "./bootstrap-secrets";

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { createLogger } from "./logger";
import { authPlugin } from "./auth/auth-plugin";
import { requestContextPlugin } from "./request-context";
import { flush as flushLogSink } from "./log-supabase-sink";
import { migrateOwnership } from "./db/migrate-ownership";
import { projectRoutes } from "./routes/projects";
import { agentRunRoutes } from "./routes/agent-run";
import { chatRoutes, awaitPendingSummaries } from "./routes/chat";
import { compileRoutes } from "./routes/compile";
import { flashRoutes } from "./routes/flash";
import { boardRoutes } from "./routes/boards";
import { evalRoutes } from "./routes/eval";
import { libraryRoutes } from "./routes/libraries";
import { capabilitiesRoutes } from "./routes/capabilities";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";
import { motionRoutes } from "./routes/motion";
import { createWebUiStatic } from "./routes/web-ui-static";
import { stopWorker } from "./serial/serialport-bridge";
import { APP_ORIGIN, API_PORT as _API_PORT } from "@dreamer/config";
import { DREAMER_BIND, IS_HOSTED } from "./env";

const API_PORT = Number(process.env.PORT ?? _API_PORT);

const log = createLogger("server");

// Static web UI (hosted deployments). Plugin registers /, /index.html;
// handleNotFound serves assets + SPA fallback for unmatched routes.
// Dev mode keeps Vite on a separate port — `plugin` is a no-op and
// `handleNotFound` returns undefined so the app behaves unchanged.
const { plugin: staticWebUi, handleNotFound } = createWebUiStatic();

// ── CORS origin list ────────────────────────────────────────────────────
//
// Hosted: same-origin by construction (API serves the web UI from the
// same Railway container), so we reflect the request's Host when it
// matches an explicit APP_ORIGIN env, otherwise deny. Dropping the
// previous `origin: true` closes an open CORS hole on the shared
// deployment.
//
// Local: keep APP_ORIGIN (the Vite dev server) — same as before — plus
// loopback aliases so `localhost` and `127.0.0.1` both work.
const HOSTED_APP_ORIGIN = process.env.APP_ORIGIN ?? "";
const corsOrigin: string[] = IS_HOSTED
  ? HOSTED_APP_ORIGIN
    ? [HOSTED_APP_ORIGIN]
    : [] // same-origin only: no APP_ORIGIN set ⇒ no cross-origin browsers allowed
  : [
      APP_ORIGIN,
      "http://localhost:3002",
      "http://127.0.0.1:3002",
      "http://localhost:3004",
      "http://127.0.0.1:3004",
    ];

// ── Ownership migration ─────────────────────────────────────────────────
// Scan project JSONs that predate the ownerId schema field. Hosted mode
// quarantines them under `_legacy/`; local mode stamps them with
// `ownerId: "local"` in place. Failures are logged and swallowed — a
// migration error must not wedge a restart, since we can always re-run
// on the next boot.
try {
  await migrateOwnership();
} catch (err) {
  log.warn(`ownership migration failed: ${err instanceof Error ? err.message : err}`);
}

const app = new Elysia()
  .use(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    })
  )
  .use(authPlugin)
  // Must come AFTER authPlugin so auth.userId is populated when the
  // request-context plugin reads it.
  .use(requestContextPlugin)
  .use(authRoutes)
  .use(adminRoutes)
  .use(projectRoutes)
  .use(agentRunRoutes)
  .use(chatRoutes)
  .use(compileRoutes)
  .use(flashRoutes)
  .use(boardRoutes)
  .use(evalRoutes)
  .use(libraryRoutes)
  .use(capabilitiesRoutes)
  .use(motionRoutes)
  .use(staticWebUi)
  .onError(({ code, request }) => {
    // Elysia's default NOT_FOUND response body is literally "NOT_FOUND",
    // which is what users see when an SPA client route falls through the
    // router. Intercept it and serve index.html / a static file instead.
    if (code !== "NOT_FOUND") return
    const url = new URL(request.url)
    return handleNotFound(url.pathname)
  })
  .listen({ port: API_PORT, hostname: DREAMER_BIND });

log.info(`listening on http://${DREAMER_BIND}:${app.server?.port}${IS_HOSTED ? " (hosted, serving web UI)" : ""}`);

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

  // Drain the Supabase log sink so the last second of warn+ entries
  // make it to Postgres before SIGKILL. In CLI mode this is a no-op.
  try {
    await flushLogSink()
  } catch (err) {
    log.warn(`flush log sink failed: ${err instanceof Error ? err.message : err}`)
  }

  log.info("shutdown complete")
  process.exit(0)
}

process.on("SIGTERM", () => { void shutdown("SIGTERM") })
process.on("SIGINT", () => { void shutdown("SIGINT") })

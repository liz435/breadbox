import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { createLogger } from "./logger";
import { projectRoutes } from "./routes/projects";
import { agentRunRoutes } from "./routes/agent-run";
import { chatRoutes } from "./routes/chat";
import { compileRoutes } from "./routes/compile";
import { flashRoutes } from "./routes/flash";
import { boardRoutes } from "./routes/boards";
import { evalRoutes } from "./routes/eval";
import { libraryRoutes } from "./routes/libraries";
import { capabilitiesRoutes } from "./routes/capabilities";
import { createWebUiStatic } from "./routes/web-ui-static";
import { APP_ORIGIN, API_PORT as _API_PORT } from "@dreamer/config";

const API_PORT = Number(process.env.PORT ?? _API_PORT);
const IS_HOSTED = process.env.DREAMER_HOSTED === "1";

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

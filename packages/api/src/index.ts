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
import { createWebUiStaticRoutes } from "./routes/web-ui-static";
import { APP_ORIGIN, API_PORT as _API_PORT } from "@dreamer/config";

const API_PORT = Number(process.env.PORT ?? _API_PORT);
const IS_HOSTED = process.env.DREAMER_HOSTED === "1";

const log = createLogger("server");

// Optional static-web-UI route — populated when `packages/app/dist/` is
// present (hosted deployments); no-op plugin otherwise so dev keeps
// serving via Vite on a separate port as before.
const staticWebUi = createWebUiStaticRoutes();

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
  .listen({ port: API_PORT, hostname: "0.0.0.0" });

log.info(`listening on http://0.0.0.0:${app.server?.port}${IS_HOSTED ? " (hosted, serving web UI)" : ""}`);

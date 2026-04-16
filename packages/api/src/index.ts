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
import { APP_ORIGIN, API_PORT as _API_PORT } from "@dreamer/config";

const API_PORT = Number(process.env.PORT ?? _API_PORT);

const log = createLogger("server");

const app = new Elysia()
  .use(
    cors({
      origin: APP_ORIGIN,
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
  .listen(API_PORT);

log.info(`listening on http://localhost:${app.server?.port}`);

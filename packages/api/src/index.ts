import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { createLogger } from "./logger";
import { projectRoutes } from "./routes/projects";
import { agentRunRoutes } from "./routes/agent-run";
import { chatRoutes } from "./routes/chat";
import { compileRoutes } from "./routes/compile";
import { APP_ORIGIN, API_PORT } from "@dreamer/config";

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
  .listen(API_PORT);

log.info(`listening on http://localhost:${app.server?.port}`);

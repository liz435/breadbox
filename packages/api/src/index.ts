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

// In hosted mode the API process also serves the built web UI, so the
// frontend talks to us via same-origin fetch. We inject `window.__DREAMER__`
// into index.html at serve time so the baked-in `http://localhost:4111`
// default gets overridden to "" (same-origin) at runtime.
const WEB_UI_DIR = `${import.meta.dir}/../../app/dist`;

async function serveIndexHtml(): Promise<Response> {
  const file = Bun.file(`${WEB_UI_DIR}/index.html`);
  if (!(await file.exists())) {
    return new Response("index.html missing — web bundle not built", {
      status: 500,
    });
  }
  const html = await file.text();
  const inject = `<script>window.__DREAMER__=${JSON.stringify({
    apiOrigin: "",
    appOrigin: "",
    preferAvr: true,
  })};</script>`;
  const patched = html.replace("<head>", `<head>${inject}`);
  return new Response(patched, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
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
  .use(evalRoutes);

if (IS_HOSTED) {
  app
    .get("/", () => serveIndexHtml())
    .all("*", async ({ path }) => {
      const assetPath = `${WEB_UI_DIR}${path}`;
      const asset = Bun.file(assetPath);
      if (await asset.exists()) return new Response(asset);
      if (!path.includes(".")) return serveIndexHtml();
      return new Response("Not Found", { status: 404 });
    });
}

app.listen(API_PORT);
  .use(evalRoutes)
  .use(libraryRoutes)
  .use(capabilitiesRoutes)
  .use(staticWebUi)
  .listen(API_PORT);

log.info(`listening on http://localhost:${app.server?.port}${IS_HOSTED ? " (hosted, serving web UI)" : ""}`);

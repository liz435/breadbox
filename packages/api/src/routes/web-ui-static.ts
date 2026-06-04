// ── Static Web UI Route (hosted mode) ────────────────────────────────────
//
// Serves the Vite-built web bundle from `packages/app/dist/` over HTTP.
// Used when the API server is also the frontend host (e.g. Railway single
// container). The CLI binary uses a separate static server (`web-ui.ts`)
// that reads from binary-embedded files — this module reads from disk.
//
// Runtime config injection: /index.html has a <script> tag added before
// the bundle loads, setting window.__BREADBOX__ so @dreamer/config picks
// up the right apiOrigin at run time. `apiOrigin: ""` means "same origin
// as the page" — correct for Railway, where UI + API share a host.
//
// Activation: only mounted when the `dist/` directory actually exists.
// Dev (`bun run dev:api`) doesn't have a dist/, so this module is inert
// and Vite keeps serving the frontend on port 3000 as before.

import { Elysia } from "elysia"
import { existsSync, readFileSync } from "fs"
import { extname, join } from "path"
import { createLogger } from "../logger"

const log = createLogger("web-ui-static")

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf":  "font/ttf",
  ".map":  "application/json",
}

function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extname(path)] ?? "application/octet-stream"
}

/**
 * Resolve `packages/app/dist/` relative to this module. In dev + compiled
 * API the module is at `packages/api/src/routes/` so four `..` steps land
 * at the repo root; then `packages/app/dist`.
 */
function resolveDistDir(): string {
  return join(import.meta.dir, "..", "..", "..", "app", "dist")
}

/**
 * Inject `window.__BREADBOX__` before any bundle <script>. `apiOrigin=""`
 * tells the client to hit the same origin as the page — the right choice
 * for single-container deploys where UI + API share a host.
 */
function injectRuntimeConfig(html: string): string {
  const script = `<script>window.__BREADBOX__=${JSON.stringify({
    apiOrigin: "",
    appOrigin: "",
    preferAvr: true,
  })};</script>`
  if (html.includes("<head>")) return html.replace("<head>", `<head>${script}`)
  return script + html
}

/**
 * Returns an Elysia plugin that serves the static web UI if `dist/`
 * exists, or an empty no-op plugin otherwise. The caller always gets
 * something safe to `.use(...)` regardless of dev-vs-built state.
 *
 * SPA-route fallback (/learn, /documentation, etc.) is handled by the
 * separate `onError` hook returned alongside — mount it with `.onError`
 * on the root Elysia app, since plugin-level `.all("*")` doesn't reliably
 * catch requests that missed every registered route.
 */
export function createWebUiStatic() {
  // Explicit opt-out for API-only deployments that share the same Docker
  // image. Set BREADBOX_API_ONLY=1 on a Railway service (or similar) that
  // should never serve the frontend even though packages/app/dist/ is
  // baked into the image.
  if (process.env.BREADBOX_API_ONLY === "1") {
    log.info("BREADBOX_API_ONLY=1 — static web UI disabled")
    return {
      plugin: new Elysia({ name: "web-ui-static-api-only" }),
      handleNotFound: () => undefined,
    }
  }

  const distDir = resolveDistDir()
  const enabled = existsSync(distDir)

  if (!enabled) {
    log.info(`no ${distDir} — static web UI disabled (dev mode assumed)`)
    return {
      plugin: new Elysia({ name: "web-ui-static-noop" }),
      handleNotFound: () => undefined,
    }
  }
  log.info(`serving static web UI from ${distDir}`)

  const indexPath = join(distDir, "index.html")

  function serveIndex(): Response {
    if (!existsSync(indexPath)) {
      return new Response("index.html not found", { status: 500 })
    }
    const html = injectRuntimeConfig(readFileSync(indexPath, "utf8"))
    return new Response(html, {
      headers: {
        "content-type": CONTENT_TYPES[".html"],
        "cache-control": "no-cache",
      },
    })
  }

  const plugin = new Elysia({ name: "web-ui-static" })
    .get("/", () => serveIndex())
    .get("/index.html", () => serveIndex())

  // Called from the root app's `.onError({ code: "NOT_FOUND" }, ...)` so
  // SPA client routes and `/assets/*` / root-level static files land here
  // after the regular router misses them.
  function handleNotFound(pathname: string): Response | undefined {
    if (pathname.startsWith("/api") || pathname.startsWith("/project")) {
      return undefined
    }
    const rel = pathname.replace(/^\/+/, "")
    const filePath = join(distDir, rel)
    if (filePath.startsWith(distDir) && existsSync(filePath)) {
      const file = Bun.file(filePath)
      const ct = contentTypeFor(filePath)
      const isHashed = /-[A-Za-z0-9_-]{8,}\./.test(pathname)
      return new Response(file, {
        headers: {
          "content-type": ct,
          "cache-control": isHashed
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
        },
      })
    }
    if (!extname(pathname)) {
      return serveIndex()
    }
    return undefined
  }

  return { plugin, handleNotFound }
}

/**
 * Back-compat thin wrapper so callers that only want the plugin half still
 * work. New code should prefer `createWebUiStatic()` to also wire up the
 * `handleNotFound` hook on the root app.
 */
export function createWebUiStaticRoutes() {
  return createWebUiStatic().plugin
}

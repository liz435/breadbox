// ── Static Web UI Route (hosted mode) ────────────────────────────────────
//
// Serves the Vite-built web bundle from `packages/app/dist/` over HTTP.
// Used when the API server is also the frontend host (e.g. Railway single
// container). The CLI binary uses a separate static server (`web-ui.ts`)
// that reads from binary-embedded files — this module reads from disk.
//
// Runtime config injection: /index.html has a <script> tag added before
// the bundle loads, setting window.__DREAMER__ so @dreamer/config picks
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
 * Inject `window.__DREAMER__` before any bundle <script>. `apiOrigin=""`
 * tells the client to hit the same origin as the page — the right choice
 * for single-container deploys where UI + API share a host.
 */
function injectRuntimeConfig(html: string): string {
  const script = `<script>window.__DREAMER__=${JSON.stringify({
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
 */
export function createWebUiStaticRoutes() {
  const distDir = resolveDistDir()
  if (!existsSync(distDir)) {
    log.info(`no ${distDir} — static web UI disabled (dev mode assumed)`)
    return new Elysia({ name: "web-ui-static-noop" })
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

  return new Elysia({ name: "web-ui-static" })
    .get("/", () => serveIndex())
    .get("/index.html", () => serveIndex())
    .get("/assets/*", ({ request }) => {
      const url = new URL(request.url)
      // Strip leading slash and join with dist/. Path traversal is blocked
      // because `distDir` pins the root and we only read files under it;
      // extname lookup would fail on anything that escapes upward.
      const rel = url.pathname.replace(/^\/+/, "")
      const filePath = join(distDir, rel)
      if (!filePath.startsWith(distDir) || !existsSync(filePath)) {
        return new Response("not found", { status: 404 })
      }
      const file = Bun.file(filePath)
      const ct = contentTypeFor(filePath)
      // Vite content-hashes asset filenames, so immutable cache is safe.
      return new Response(file, {
        headers: { "content-type": ct, "cache-control": "public, max-age=31536000, immutable" },
      })
    })
    // SPA fallback. Registered last in the app chain, so it only fires for
    // paths that no API route (project/, api/*) matched. Client-side routes
    // like /learn and /documentation come through here as full-page loads —
    // we serve index.html and the client router takes over. Also picks up
    // root-level static files (favicon.ico, robots.txt) that aren't under
    // /assets/*. Genuine 404s: anything with an extension that isn't on disk.
    .all("*", ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname.startsWith("/api") || url.pathname.startsWith("/project")) {
        return new Response("Not Found", { status: 404 })
      }
      const rel = url.pathname.replace(/^\/+/, "")
      const filePath = join(distDir, rel)
      if (filePath.startsWith(distDir) && existsSync(filePath)) {
        const file = Bun.file(filePath)
        const ct = contentTypeFor(filePath)
        return new Response(file, {
          headers: { "content-type": ct, "cache-control": "public, max-age=3600" },
        })
      }
      if (!extname(url.pathname)) {
        return serveIndex()
      }
      return new Response("not found", { status: 404 })
    })
}

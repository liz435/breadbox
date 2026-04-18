// ── Static web UI server ────────────────────────────────────────────────
//
// Serves Vite's production build (embedded in the binary via
// web-ui-manifest.generated.ts) over HTTP. Used by `dreamer headed` in
// standalone-binary mode — dev-from-source still spawns Vite instead.
//
// Responsibilities:
//   - Look up request path in the asset manifest.
//   - For index.html, inject a <script> tag that sets window.__DREAMER__
//     before the app bundle loads, so @dreamer/config picks up the actual
//     API origin (port chosen at runtime).
//   - Send static files directly from their embedded paths.

import { EMBEDDED_ASSETS } from "./web-ui-manifest.generated"
import { createLogger } from "@dreamer/api/logger"

const log = createLogger("web-ui")

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

function contentTypeFor(urlPath: string): string {
  const ext = urlPath.slice(urlPath.lastIndexOf("."))
  return CONTENT_TYPES[ext] ?? "application/octet-stream"
}

function injectRuntimeConfig(html: string, apiOrigin: string, appOrigin: string): string {
  // preferAvr: the CLI binary ships arduino-cli via the toolchain resolver,
  // so real AVR compilation is always available. Force AVR-mode simulation
  // instead of auto-picking transpile — produces cycle-accurate output
  // identical to what `dreamer flash` would put on a physical Uno, and
  // eliminates the transpile/avr divergence bug class. Only the CLI-served
  // UI sets this; the standalone web app keeps its transpile fallback.
  const config = { apiOrigin, appOrigin, preferAvr: true }
  const script = `<script>window.__DREAMER__=${JSON.stringify(config)};</script>`
  if (html.includes("<head>")) return html.replace("<head>", `<head>${script}`)
  if (html.includes("<html>")) return html.replace("<html>", `<html><head>${script}</head>`)
  return script + html
}

export type StaticWebUI = {
  port: number
  stop: () => void | Promise<void>
}

export function startStaticWebUI(
  port: number,
  apiOrigin: string,
  appOrigin: string,
): StaticWebUI {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)
      let pathname = url.pathname

      // Canonical paths: "/" and "/index.html" share the same asset.
      let assetPath = EMBEDDED_ASSETS[pathname]

      // SPA fallback: if the path has no extension and isn't in the
      // manifest, serve index.html (for client-side routed paths).
      if (!assetPath && !pathname.includes(".")) {
        assetPath = EMBEDDED_ASSETS["/"] ?? EMBEDDED_ASSETS["/index.html"]
        pathname = "/index.html"
      }

      if (!assetPath) {
        return new Response("not found", { status: 404 })
      }

      const file = Bun.file(assetPath)

      // index.html needs runtime config injection.
      if (pathname === "/index.html" || pathname === "/") {
        const html = await file.text()
        const injected = injectRuntimeConfig(html, apiOrigin, appOrigin)
        return new Response(injected, {
          headers: {
            "content-type": CONTENT_TYPES[".html"],
            "cache-control": "no-cache",
          },
        })
      }

      // Static asset — serve directly. Hashed filenames, so cache hard.
      const ct = contentTypeFor(pathname)
      const cacheControl = /-[A-Za-z0-9_-]{8,}\./.test(pathname)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, must-revalidate"
      return new Response(file, {
        headers: { "content-type": ct, "cache-control": cacheControl },
      })
    },
    error(err) {
      log.error(`request error: ${err}`)
      return new Response("internal error", { status: 500 })
    },
  })

  log.info(`static web UI on http://localhost:${server.port}`)
  return {
    port: server.port ?? port,
    stop: () => server.stop(),
  }
}

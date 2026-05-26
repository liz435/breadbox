import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const APP_PORT = Number(process.env.APP_PORT ?? 3002)
const API_PORT = Number(process.env.API_PORT ?? process.env.DREAMER_API_PORT ?? 4111)
const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${APP_PORT}`
const API_ORIGIN = process.env.API_ORIGIN ?? process.env.VITE_API_ORIGIN ?? `http://localhost:${API_PORT}`

// Vite proxies /api and /__bootstrap onto the Elysia API on the loopback
// interface. Same-origin in the browser means the `dreamer_local` cookie
// set by /__bootstrap is attached to every /api request without any
// cross-origin fetch ceremony. `changeOrigin: true` rewrites the Host
// header to `127.0.0.1:<API_PORT>`, which matches the authPlugin's
// LOCAL_HOST_ALLOW set — the app's port (3002/3004) would otherwise 403.
//
// `configureProxy` adds X-Forwarded-Host / -Proto so that hosted-mode
// auth in dev (DREAMER_HOSTED=1) reconstructs the OAuth `redirect_uri`
// as `http://localhost:3002/...` instead of `http://127.0.0.1:4111/...`.
// GitHub's OAuth flow requires the redirect_uri at /callback to byte-
// match the one used at /start, and the registered app, or the exchange
// fails. Without this header rewrite, real-auth-in-dev is unworkable.
const API_PROXY_TARGET = `http://127.0.0.1:${API_PORT}`

function configureProxy(proxy: {
  on: (event: "proxyReq", handler: (proxyReq: { setHeader: (name: string, value: string) => void }, req: { headers: Record<string, string | string[] | undefined> }) => void) => void
}): void {
  proxy.on("proxyReq", (proxyReq, req) => {
    const host = req.headers["host"]
    if (typeof host === "string" && host.length > 0) {
      proxyReq.setHeader("x-forwarded-host", host)
    }
    proxyReq.setHeader("x-forwarded-proto", "http")
  })
}

console.log(`[vite.config] API_ORIGIN=${API_ORIGIN} proxy=${API_PROXY_TARGET}`)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@dreamer/schemas": path.resolve(__dirname, "../schemas/src/index.ts"),
    },
  },
  // Dev-only: pre-scan every source file so Vite discovers all (incl. lazy)
  // imports before serving the first request. Prevents the "chunk-XXXX.js
  // 404" caused by mid-session re-optimization. Has no effect on prod builds.
  optimizeDeps: {
    entries: ["index.html", "src/**/*.{ts,tsx}"],
  },
  server: {
    port: APP_PORT,
    proxy: {
      "/api": { target: API_PROXY_TARGET, changeOrigin: true, configure: configureProxy },
      "/__bootstrap": { target: API_PROXY_TARGET, changeOrigin: true, configure: configureProxy },
    },
  },
  build: { target: "esnext" },
  // Inject env values at build time so process.env is never referenced
  // in the browser bundle (process is not defined in browsers).
  define: {
    "process.env.APP_PORT": JSON.stringify(String(APP_PORT)),
    "process.env.API_PORT": JSON.stringify(String(API_PORT)),
    "process.env.APP_ORIGIN": JSON.stringify(APP_ORIGIN),
    "process.env.API_ORIGIN": JSON.stringify(API_ORIGIN),
  },
});

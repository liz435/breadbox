import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Keep these defaults in sync with packages/config — the dev proxy target
// below must point at whatever port the API server actually binds. Quiet
// 28xxx range to avoid the crowded 3000/8080-style dev ports.
const APP_PORT = Number(process.env.APP_PORT ?? 28420)
const API_PORT = Number(process.env.API_PORT ?? process.env.BREADBOX_API_PORT ?? 28421)
const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${APP_PORT}`
const API_ORIGIN = process.env.API_ORIGIN ?? process.env.VITE_API_ORIGIN ?? `http://localhost:${API_PORT}`

// Vite proxies /api, /project, /agent, and /auth onto the Elysia API on
// the loopback interface. Same-origin in the browser means the Supabase
// auth cookies set by /auth/callback are attached to every /api request
// without any cross-origin fetch ceremony. `changeOrigin: true` rewrites
// the Host header to `127.0.0.1:<API_PORT>`, which matches the
// authPlugin's LOCAL_HOST_ALLOW set — the app's port (28420/28440) would
// otherwise 403.
//
// `configureProxy` adds X-Forwarded-Host / -Proto so that hosted-mode
// auth in dev (BREADBOX_MODE=hosted) reconstructs the OAuth `redirect_uri`
// as `http://localhost:28420/auth/callback` instead of
// `http://127.0.0.1:28421/auth/callback`. Supabase's GitHub provider
// requires the redirect_uri at exchange time to byte-match the one used
// at sign-in init, or the exchange fails.
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
      // `ws: true` makes the proxy forward WebSocket upgrade requests.
      // Without it, /api/boards/:path (the local-board serial proxy) hits
      // Vite directly, which has no WS handler — the browser's WebSocket
      // immediately fires onerror and we surface that as
      // "WebSocket error connecting to /dev/cu.usbmodem1101".
      "/api": { target: API_PROXY_TARGET, changeOrigin: true, ws: true, configure: configureProxy },
      "/project": { target: API_PROXY_TARGET, changeOrigin: true, configure: configureProxy },
      "/agent": { target: API_PROXY_TARGET, changeOrigin: true, configure: configureProxy },
      "/auth": { target: API_PROXY_TARGET, changeOrigin: true, configure: configureProxy },
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

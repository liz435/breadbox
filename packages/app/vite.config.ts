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
const API_PROXY_TARGET = `http://127.0.0.1:${API_PORT}`

console.log(`[vite.config] API_ORIGIN=${API_ORIGIN} proxy=${API_PROXY_TARGET}`)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@dreamer/schemas": path.resolve(__dirname, "../schemas/src/index.ts"),
    },
  },
  server: {
    port: APP_PORT,
    proxy: {
      "/api": { target: API_PROXY_TARGET, changeOrigin: true },
      "/__bootstrap": { target: API_PROXY_TARGET, changeOrigin: true },
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

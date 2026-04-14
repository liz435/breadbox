import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const APP_PORT = Number(process.env.APP_PORT ?? 3002)
const API_PORT = Number(process.env.API_PORT ?? 4111)
const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${APP_PORT}`
const API_ORIGIN = process.env.API_ORIGIN ?? `http://localhost:${API_PORT}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@dreamer/schemas": path.resolve(__dirname, "../schemas/src/index.ts"),
    },
  },
  server: { port: APP_PORT },
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

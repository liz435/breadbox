import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { APP_PORT } from "@dreamer/config";

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
});

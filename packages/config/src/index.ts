// Read from environment. In Vite (browser), `process` does not exist —
// values are injected at build time via vite.config.ts `define`. In Bun/Node
// (API server), `process.env` is used directly.
const env =
  typeof process !== "undefined" && process.env
    ? process.env
    : ({} as Record<string, string | undefined>)

export const APP_PORT = Number(env.APP_PORT ?? 3002)
export const API_PORT = Number(env.API_PORT ?? 4111)

export const APP_ORIGIN = env.APP_ORIGIN ?? `http://localhost:${APP_PORT}`
export const API_ORIGIN = env.API_ORIGIN ?? `http://localhost:${API_PORT}`

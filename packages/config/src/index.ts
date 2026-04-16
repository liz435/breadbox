// Vite replaces `process.env.X` tokens at build time via `define` in
// vite.config.ts.  We must reference `process.env.X` directly — never
// alias `process.env` to a local variable, or Vite cannot match and
// replace the tokens.

export const APP_PORT = Number(process.env.APP_PORT ?? 3002)
export const API_PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 4111)

export const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${APP_PORT}`
export const API_ORIGIN = process.env.API_ORIGIN ?? `http://localhost:${API_PORT}`

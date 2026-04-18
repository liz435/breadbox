// Vite replaces `process.env.X` tokens at build time via `define` in
// vite.config.ts. We must reference `process.env.X` directly — never
// alias `process.env` to a local variable, or Vite cannot match and
// replace the tokens.
//
// In the browser, a second lookup precedes the build-time default: if the
// embedded web UI was served by the Dreamer standalone binary, the host
// injected `<script>window.__DREAMER__ = { apiOrigin }</script>` into
// index.html at serve time. That runtime value wins so users can run the
// binary with a custom API_PORT without rebuilding the bundle.

export const APP_PORT = Number(process.env.APP_PORT ?? 3002)
export const API_PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 4111)

declare global {
  interface Window {
    __DREAMER__?: { apiOrigin?: string; appOrigin?: string }
  }
}

const runtimeApiOrigin: string | undefined =
  typeof window !== "undefined" ? window.__DREAMER__?.apiOrigin : undefined
const runtimeAppOrigin: string | undefined =
  typeof window !== "undefined" ? window.__DREAMER__?.appOrigin : undefined

export const APP_ORIGIN = runtimeAppOrigin ?? process.env.APP_ORIGIN ?? `http://localhost:${APP_PORT}`
export const API_ORIGIN = runtimeApiOrigin ?? process.env.API_ORIGIN ?? `http://localhost:${API_PORT}`

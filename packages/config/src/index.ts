// Vite replaces `process.env.X` tokens at build time via `define` in
// vite.config.ts. We must reference `process.env.X` directly — never
// alias `process.env` to a local variable, or Vite cannot match and
// replace the tokens.
//
// In the browser, a second lookup precedes the build-time default: if the
// embedded web UI was served by the Breadbox standalone binary, the host
// injected `<script>window.__BREADBOX__ = { apiOrigin }</script>` into
// index.html at serve time. That runtime value wins so users can run the
// binary with a custom API_PORT without rebuilding the bundle.

// Defaults deliberately live in a quiet 28xxx range (and below 32768, so they
// sit under both macOS's and Linux's ephemeral-port ranges): the common dev
// ports — 3000/3002/8080/etc. — collide constantly on a busy machine. These are
// only preferences; the CLI's headed/serve launcher falls back to an
// OS-assigned free port when one is taken, so a collision never blocks startup.
export const APP_PORT = Number(process.env.APP_PORT ?? 28420)
export const API_PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 28421)

declare global {
  interface Window {
    __BREADBOX__?: {
      apiOrigin?: string
      appOrigin?: string
      /**
       * When true, the host (typically the CLI's static web UI server)
       * signals that arduino-cli is guaranteed available and the simulator
       * should always use AVR mode — skipping the transpiler fallback.
       * Unset (standalone web app, dev mode) leaves auto-mode untouched.
       */
      preferAvr?: boolean
    }
  }
}

const runtimeApiOrigin: string | undefined =
  typeof window !== "undefined" ? window.__BREADBOX__?.apiOrigin : undefined
const runtimeAppOrigin: string | undefined =
  typeof window !== "undefined" ? window.__BREADBOX__?.appOrigin : undefined

export const APP_ORIGIN = runtimeAppOrigin ?? process.env.APP_ORIGIN ?? `http://localhost:${APP_PORT}`
export const API_ORIGIN = runtimeApiOrigin ?? process.env.API_ORIGIN ?? `http://localhost:${API_PORT}`

/** True when the CLI-embedded static server has explicitly requested AVR-only mode. */
export const PREFER_AVR: boolean =
  typeof window !== "undefined" ? window.__BREADBOX__?.preferAvr === true : false

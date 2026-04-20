// ── Bootstrap URL helper (CLI side) ─────────────────────────────────────
//
// Split out of headed.ts so unit tests can import it without pulling in
// the full API route graph (chat, agent-run, web-ui-manifest, etc.). The
// helper's only dependency is the bootstrap-nonce signer — stable, no
// side-effecty boot sequence.

import { signNonce } from "@dreamer/api/auth/bootstrap-nonce"

/**
 * Build the one-shot bootstrap URL the CLI prints to the terminal.
 *
 * Target is the frontend port (Vite dev server in dev-from-source mode,
 * the embedded static UI server in standalone-binary mode). Same-origin
 * there means the `dreamer_local` cookie set by `/__bootstrap` is
 * automatically attached to every subsequent `/api/*` request.
 */
export function buildBootstrapUrl(appPort: number): string {
  const nonce = signNonce()
  return `http://127.0.0.1:${appPort}/__bootstrap?nonce=${encodeURIComponent(nonce)}`
}

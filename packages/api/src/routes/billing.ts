// ── Billing routes ──────────────────────────────────────────────────────
//
// Today: one endpoint. Reads the caller's wallet + lazy-seeds if missing
// so a freshly-signed-up user can pull their initial balance with one
// round trip. CLI mode synthesizes "unlimited" so the same UI chip
// renders without an `IS_HOSTED_MODE` branch on the client.
//
// Future: ledger history (`GET /api/billing/transactions`), checkout
// session creation, customer portal, purchase preview — all land here.

import { Elysia } from "elysia"
import type { AuthContext } from "../auth/context"
import { authPlugin } from "../auth/auth-plugin"
import { ensureWalletForUser } from "../services/billing"
import { createLogger } from "../logger"

const log = createLogger("billing-routes")

function requireOwnerId(auth: AuthContext | null | undefined): string {
  if (!auth) throw new Error("missing auth context on authed route")
  return auth.userId
}

export const billingRoutes = new Elysia({ prefix: "/api/billing" })
  .use(authPlugin)
  // ── GET /api/billing/wallet ─────────────────────────────────────────
  //
  // Returns `{ balancePosted, currency }`. `balancePosted` is `null` in
  // hosted mode for an unauthenticated request (caller is on the public
  // path) and a positive integer otherwise. CLI mode reports `null` for
  // balance with `currency: 'unlimited'` so the UI can short-circuit
  // the "out of credits" surface without an env import.
  .get("/wallet", async ({ auth, set }) => {
    const ownerId = requireOwnerId(auth)
    try {
      const snapshot = await ensureWalletForUser(ownerId)
      if (!Number.isFinite(snapshot.balancePosted)) {
        return { balancePosted: null, currency: "unlimited" as const }
      }
      return {
        balancePosted: snapshot.balancePosted,
        currency: "credits" as const,
        updatedAt: snapshot.updatedAt,
      }
    } catch (err) {
      log.warn(
        `wallet read failed for ${ownerId}: ${err instanceof Error ? err.message : String(err)}`,
      )
      set.status = 500
      return { error: "wallet read failed" }
    }
  })

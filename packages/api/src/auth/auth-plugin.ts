// ── Auth plugin ─────────────────────────────────────────────────────────
//
// Single-tenant local auth: every request is the fixed CLI user. The
// middleware populates { auth: AuthContext } for downstream routes.

import { cliAuthPlugin } from "./cli-middleware"

export const authPlugin = cliAuthPlugin

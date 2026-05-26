// ── Auth plugin selector ────────────────────────────────────────────────
//
// Picks the active auth middleware once at startup based on DREAMER_MODE.
// Both implementations populate the same { auth: AuthContext } shape,
// so downstream routes never branch on mode.

import { IS_HOSTED_MODE } from "../supabase/env"
import { cliAuthPlugin } from "./cli-middleware"
import { supabaseAuthPlugin } from "./supabase-middleware"

export const authPlugin = IS_HOSTED_MODE ? supabaseAuthPlugin : cliAuthPlugin

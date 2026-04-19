// ── Capabilities Route ────────────────────────────────────────────────────
//
// GET /api/capabilities
//
// Runtime feature flags the UI reads once on boot. Lets the same React
// bundle behave differently between the CLI binary (all features on) and
// a hosted deployment (library mutations gated).
//
// Add flags sparingly — every new one is a conditional branch in the UI
// that must be tested in both modes.

import { Elysia } from "elysia"
import { resolveArduinoCli } from "../toolchain"
import { IS_HOSTED } from "../env"

export type Capabilities = {
  /**
   * DREAMER_HOSTED=1 deployments set this to signal that the backend is
   * shared/multi-tenant and library install/uninstall are disabled.
   * The UI hides install buttons, keeps the rest of the experience intact.
   */
  hosted: boolean

  /**
   * True when the backend can locate an arduino-cli binary. In the CLI
   * binary + managed install this is always true after `dreamer setup`.
   * In hosted deploys it should also be true (baked into the image).
   * If false, the UI disables compile/flash paths and shows a helpful
   * error instead of attempting to POST to a disabled compile route.
   */
  arduinoCliAvailable: boolean

  /**
   * Protocol version — bumped whenever the capability shape changes.
   * Lets older UIs detect newer backends and fall back gracefully.
   */
  version: 1
}

export const capabilitiesRoutes = new Elysia().get("/api/capabilities", async (): Promise<Capabilities> => {
  let arduinoCliAvailable = false
  try {
    await resolveArduinoCli({ install: false })
    arduinoCliAvailable = true
  } catch {
    arduinoCliAvailable = false
  }
  return {
    hosted: IS_HOSTED,
    arduinoCliAvailable,
    version: 1,
  }
})

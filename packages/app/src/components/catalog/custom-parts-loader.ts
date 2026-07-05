// ── Custom Parts bootstrap ─────────────────────────────────────────────────
//
// On boot, fetch the user's custom parts and register each into the runtime
// overlay so they appear in the palette and simulate like built-ins. Code parts
// are dynamically imported; DSL parts are fetched and interpreted. Errors in one
// part don't block the others.

import { API_ORIGIN } from "@dreamer/config"
import { fetchCustomPart, listCustomParts } from "@/components/catalog/custom-parts-api"
import { loadPluginFromUrl, registerDslPart, type LoadPluginResult } from "@/components/catalog/load-plugin"

export async function loadAllCustomParts(): Promise<void> {
  const parts = await listCustomParts()

  await Promise.all(
    parts.map(async (part) => {
      let result: LoadPluginResult
      if (part.format === "code") {
        result = await loadPluginFromUrl(`${API_ORIGIN}/api/custom-parts/${part.id}/module.js`)
      } else {
        try {
          const fetched = await fetchCustomPart(part.id)
          result = fetched
            ? registerDslPart(fetched.source)
            : { ok: false, error: "failed to fetch source" }
        } catch (err) {
          result = { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      }
      if (!result.ok) {
        console.error(`Custom part "${part.id}" failed to load: ${result.error}`)
      }
    }),
  )
}

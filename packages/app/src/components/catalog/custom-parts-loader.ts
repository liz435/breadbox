// ── Custom Parts bootstrap ─────────────────────────────────────────────────
//
// On boot, fetch the user's custom parts and register each into the runtime
// overlay so they appear in the palette and simulate like built-ins. Code parts
// are dynamically imported; DSL parts are fetched and interpreted. Errors in one
// part don't block the others.

import { API_ORIGIN } from "@dreamer/config"
import { loadPluginFromUrl, registerDslPart, type LoadPluginResult } from "@/components/catalog/load-plugin"

type CustomPartList = { parts: Array<{ id: string; format: "code" | "dsl" }> }

export async function loadAllCustomParts(): Promise<void> {
  let list: CustomPartList
  try {
    const res = await fetch(`${API_ORIGIN}/api/custom-parts`)
    if (!res.ok) return
    list = (await res.json()) as CustomPartList
  } catch (err) {
    console.error("Failed to list custom parts", err)
    return
  }

  await Promise.all(
    list.parts.map(async (part) => {
      let result: LoadPluginResult
      if (part.format === "code") {
        result = await loadPluginFromUrl(`${API_ORIGIN}/api/custom-parts/${part.id}/module.js`)
      } else {
        try {
          const res = await fetch(`${API_ORIGIN}/api/custom-parts/${part.id}/source`)
          const data = res.ok ? ((await res.json()) as { source: string }) : null
          result = data ? registerDslPart(data.source) : { ok: false, error: `HTTP ${res.status}` }
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

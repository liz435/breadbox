// ── Custom Parts bootstrap ─────────────────────────────────────────────────
//
// Fetches the list of user-authored custom parts from the sidecar and
// dynamically imports each transpiled module, registering it into the runtime
// overlay so it's available in the palette and simulator. The modules are
// served same-origin by the sidecar, so import() needs no special CSP. Errors
// in one part don't block the others.

import { loadPluginFromUrl } from "@/components/catalog/load-plugin"

type CustomPartList = { parts: Array<{ id: string }> }

export async function loadAllCustomParts(): Promise<void> {
  let list: CustomPartList
  try {
    const res = await fetch("/api/custom-parts")
    if (!res.ok) return
    list = (await res.json()) as CustomPartList
  } catch (err) {
    console.error("Failed to list custom parts", err)
    return
  }

  await Promise.all(
    list.parts.map(async (part) => {
      const result = await loadPluginFromUrl(`/api/custom-parts/${part.id}/module.js`)
      if (!result.ok) {
        console.error(`Custom part "${part.id}" failed to load: ${result.error}`)
      }
    }),
  )
}

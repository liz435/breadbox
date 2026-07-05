// ── On-demand custom part registration ─────────────────────────────────────
//
// Custom parts normally load once at app boot (custom-parts-loader). But board
// state can arrive from outside the running app — the MCP server saving a new
// part and placing it via apply_design while the user chats — and the runtime
// overlay won't know that part yet, so the canvas draws the "missing part"
// placeholder and the palette lacks it until a full reload.
//
// ensureCustomPartsRegistered closes that gap: given the component types of an
// incoming board, it fetches and registers any unknown custom:* part. Failures
// are logged and retried on the next board broadcast (the part may simply not
// be saved yet).

import { isCustomComponentType } from "@dreamer/schemas"
import { API_ORIGIN } from "@dreamer/config"
import { getCustomDef } from "@/components/catalog/custom-store"
import { fetchCustomPart } from "@/components/catalog/custom-parts-api"
import { loadPluginFromUrl, registerDslPart } from "@/components/catalog/load-plugin"

const inflight = new Map<string, Promise<void>>()

async function fetchAndRegister(type: string, id: string): Promise<void> {
  const part = await fetchCustomPart(id)
  if (!part) {
    console.error(`Custom part "${id}" is referenced by the board but couldn't be fetched`)
    return
  }
  const result =
    part.format === "code"
      ? await loadPluginFromUrl(`${API_ORIGIN}/api/custom-parts/${id}/module.js`)
      : registerDslPart(part.source)
  if (!result.ok) {
    console.error(`Custom part "${type}" failed to load on demand: ${result.error}`)
  }
}

/**
 * Fetch and register any of the given component types that are unknown custom
 * parts. Resolves when every triggered (or already in-flight) load settles;
 * callers that don't care can ignore the promise.
 */
export function ensureCustomPartsRegistered(types: Iterable<string>): Promise<void> {
  const pending: Array<Promise<void>> = []
  for (const type of new Set(types)) {
    if (!isCustomComponentType(type)) continue
    if (getCustomDef(type)) continue
    const existing = inflight.get(type)
    if (existing) {
      pending.push(existing)
      continue
    }
    const id = type.slice("custom:".length)
    const load = fetchAndRegister(type, id)
      .catch((err: unknown) => {
        console.error(`Custom part "${type}" failed to load on demand`, err)
      })
      .finally(() => {
        inflight.delete(type)
      })
    inflight.set(type, load)
    pending.push(load)
  }
  return Promise.all(pending).then(() => undefined)
}

// ── Custom Parts API client ─────────────────────────────────────────────────
//
// Thin fetch wrappers over the sidecar's /api/custom-parts routes, plus
// saveAndReload — the authoring flow's core: persist the source, then
// dynamically re-import the transpiled module so the change is live in the
// palette and simulator immediately (no reload). The import URL is cache-busted
// so the browser fetches the new version rather than a cached module.

import { loadPluginFromUrl } from "@/components/catalog/load-plugin"
import { unregisterCustom } from "@/components/catalog/custom-store"

export type CustomPartSummary = { id: string }
export type SaveResult = { ok: true } | { ok: false; error: string }

export async function listCustomParts(): Promise<CustomPartSummary[]> {
  try {
    const res = await fetch("/api/custom-parts")
    if (!res.ok) return []
    const data = (await res.json()) as { parts: CustomPartSummary[] }
    return data.parts
  } catch {
    return []
  }
}

export async function fetchCustomPartSource(id: string): Promise<string | null> {
  const res = await fetch(`/api/custom-parts/${id}/source`)
  if (!res.ok) return null
  const data = (await res.json()) as { source: string }
  return data.source
}

export async function saveCustomPartSource(id: string, source: string): Promise<SaveResult> {
  const res = await fetch("/api/custom-parts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, source }),
  })
  // A non-JSON body means the request fell through to the SPA static handler —
  // i.e. the custom-parts route isn't in the running server. The desktop
  // sidecar binary predates it; rebuild with `bun run desktop:dev:fresh`.
  const contentType = res.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      error: "Custom-parts API not found — rebuild the desktop sidecar (bun run desktop:dev:fresh).",
    }
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (res.ok && data.ok) return { ok: true }
  return { ok: false, error: data.error ?? `Save failed (HTTP ${res.status})` }
}

/** Save the source, then (re)load the transpiled module so it's live immediately. */
export async function saveAndReload(id: string, source: string): Promise<SaveResult> {
  const saved = await saveCustomPartSource(id, source)
  if (!saved.ok) return saved
  const loaded = await loadPluginFromUrl(`/api/custom-parts/${id}/module.js?v=${Date.now()}`)
  return loaded.ok ? { ok: true } : { ok: false, error: loaded.error }
}

/** Delete a part's file and unregister it from the runtime overlay. */
export async function removeCustomPart(id: string): Promise<boolean> {
  const res = await fetch(`/api/custom-parts/${id}`, { method: "DELETE" })
  if (res.ok) unregisterCustom(`custom:${id}`)
  return res.ok
}

/** Extract the part id (the name after `custom:`) declared in a part's source. */
export function extractPartId(source: string): string | null {
  const match = source.match(/type:\s*["'`]custom:([a-z0-9-]+)["'`]/)
  return match ? match[1] : null
}

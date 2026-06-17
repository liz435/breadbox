// ── Custom Parts API client ─────────────────────────────────────────────────
//
// Fetch wrappers over /api/custom-parts, plus saveAndReload — persist a part
// then register it live. Parts come in two formats: "code" (a host-SDK module,
// re-imported) and "dsl" (a declarative spec, interpreted). All requests go
// through API_ORIGIN — the desktop serves UI and API on different origins.

import { API_ORIGIN } from "@dreamer/config"
import { loadPluginFromUrl, registerDslPart } from "@/components/catalog/load-plugin"
import { unregisterCustom } from "@/components/catalog/custom-store"

export type CustomPartFormat = "code" | "dsl"
export type CustomPartSummary = { id: string; format: CustomPartFormat }
export type SaveResult = { ok: true } | { ok: false; error: string }

export async function listCustomParts(): Promise<CustomPartSummary[]> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/custom-parts`)
    if (!res.ok) return []
    const data = (await res.json()) as { parts: CustomPartSummary[] }
    return data.parts
  } catch {
    return []
  }
}

export async function fetchCustomPart(
  id: string,
): Promise<{ source: string; format: CustomPartFormat } | null> {
  const res = await fetch(`${API_ORIGIN}/api/custom-parts/${id}/source`)
  if (!res.ok) return null
  const data = (await res.json()) as { source: string; format: CustomPartFormat }
  return { source: data.source, format: data.format }
}

export async function saveCustomPartSource(
  id: string,
  format: CustomPartFormat,
  source: string,
): Promise<SaveResult> {
  const res = await fetch(`${API_ORIGIN}/api/custom-parts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, format, source }),
  })
  // A non-JSON body means the request fell through to the SPA static handler —
  // the custom-parts route isn't in the running server (rebuild the sidecar).
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

/** Save the part, then register it live (code → re-import module; dsl → interpret). */
export async function saveAndReload(
  id: string,
  format: CustomPartFormat,
  source: string,
): Promise<SaveResult> {
  const saved = await saveCustomPartSource(id, format, source)
  if (!saved.ok) return saved
  const loaded =
    format === "code"
      ? await loadPluginFromUrl(`${API_ORIGIN}/api/custom-parts/${id}/module.js?v=${Date.now()}`)
      : registerDslPart(source)
  return loaded.ok ? { ok: true } : { ok: false, error: loaded.error }
}

/** Delete a part's file and unregister it from the runtime overlay. */
export async function removeCustomPart(id: string): Promise<boolean> {
  const res = await fetch(`${API_ORIGIN}/api/custom-parts/${id}`, { method: "DELETE" })
  if (res.ok) unregisterCustom(`custom:${id}`)
  return res.ok
}

/** Guess a part's format from its source: a JSON object with a `type` is DSL. */
export function detectFormat(source: string): CustomPartFormat {
  const trimmed = source.trim()
  if (!trimmed.startsWith("{")) return "code"
  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown }
    return parsed && typeof parsed === "object" && typeof parsed.type === "string" ? "dsl" : "code"
  } catch {
    return "code"
  }
}

/** The id (name after `custom:`) declared in a part's source — works for code or DSL. */
export function extractPartId(source: string): string | null {
  const match = source.match(/["']?type["']?\s*:\s*["'`]custom:([a-z0-9-]+)["'`]/)
  return match ? match[1] : null
}

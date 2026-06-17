// ── Custom Component Loader ────────────────────────────────────────────────
//
// Turns a plugin module into a registered custom component. The pure,
// synchronous core (registerPluginModule) runs a factory against the host and
// registers the result — this is the unit-testable seam. loadPluginFromUrl
// adds the runtime dynamic-import step used by the authoring flow: the sidecar
// serves the transpiled module same-origin, so import() needs no unsafe-eval.

import type { ComponentDefinition } from "@/components/component-definition"
import { createPluginHost, type CustomComponentModule } from "@/components/catalog/plugin-host"
import { registerCustom } from "@/components/catalog/custom-store"

export type LoadPluginResult =
  | { ok: true; def: ComponentDefinition }
  | { ok: false; error: string }

/**
 * Run an already-loaded plugin factory against the host and register the result.
 * Synchronous and side-effecting (registers into the overlay) — the core the
 * URL loader delegates to, and the one exercised by tests.
 */
export function registerPluginModule(factory: unknown): LoadPluginResult {
  if (typeof factory !== "function") {
    return { ok: false, error: "Plugin must `export default` a factory function" }
  }
  try {
    const host = createPluginHost()
    const def = (factory as CustomComponentModule)(host)
    if (!def || typeof def.type !== "string" || !def.type.startsWith("custom:")) {
      return { ok: false, error: "Plugin factory must return a component with a custom: type" }
    }
    registerCustom(def)
    return { ok: true, def }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Fetch a plugin module from the sidecar and register it. The module text is
 * fetched (CORS-safe) and imported from a same-origin blob URL, so a
 * cross-origin API (desktop serves UI and API on different origins) doesn't
 * trip ES-module CORS. Browser-only; not unit-tested.
 */
export async function loadPluginFromUrl(url: string): Promise<LoadPluginResult> {
  try {
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `Failed to fetch module (HTTP ${res.status})` }
    const js = await res.text()
    const blobUrl = URL.createObjectURL(new Blob([js], { type: "text/javascript" }))
    try {
      const mod = await import(/* @vite-ignore */ blobUrl)
      return registerPluginModule(mod.default)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

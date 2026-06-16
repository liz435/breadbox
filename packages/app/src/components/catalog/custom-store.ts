// ── Custom Component Overlay Store ─────────────────────────────────────────
//
// Runtime registry of user-authored custom components, layered on top of the
// static built-in COMPONENT_REGISTRY. Populated by load-plugin at runtime;
// read by getComponentDef / getComponentRenderer and (reactively) by the
// palette via useComponentCatalog. Kept dependency-light (no imports from the
// manager) so it can be consulted from anywhere without an import cycle.

import type { ComponentDefinition } from "@/components/component-definition"

const customDefs = new Map<string, ComponentDefinition>()
const listeners = new Set<() => void>()

// Cached snapshot so useSyncExternalStore gets a stable reference between changes.
let snapshot: ComponentDefinition[] = []

function emit(): void {
  snapshot = [...customDefs.values()]
  for (const listener of listeners) listener()
}

/** Register (or replace) a custom component. Notifies subscribers. */
export function registerCustom(def: ComponentDefinition): void {
  customDefs.set(def.type, def)
  emit()
}

/** Remove a custom component by type. Notifies subscribers if it existed. */
export function unregisterCustom(type: string): void {
  if (customDefs.delete(type)) emit()
}

/** Look up a custom component definition by type. */
export function getCustomDef(type: string): ComponentDefinition | undefined {
  return customDefs.get(type)
}

/** Stable snapshot of all custom definitions (for useSyncExternalStore). */
export function getCustomSnapshot(): ComponentDefinition[] {
  return snapshot
}

/** Subscribe to custom-component changes; returns an unsubscribe function. */
export function subscribeCustom(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test-only: clear all registered custom components. */
export function __resetCustomComponents(): void {
  customDefs.clear()
  emit()
}

// ── Component Registry (compatibility shim) ────────────────────────────────
//
// The registry now lives in catalog/ — one folder per component, each owning
// its definition and (where it has one) its colocated renderer. This module
// re-exports the assembled registry so existing imports of
// "@/components/registry" keep working.
//
// See catalog/manager.ts for how the registry is built and how to add a
// component.

export { COMPONENT_REGISTRY, getComponentDef } from "@/components/catalog/manager"

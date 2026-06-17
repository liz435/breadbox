// ── useComponentCatalog ────────────────────────────────────────────────────
//
// The full component catalog — built-ins plus custom components registered at
// runtime — as a reactive list. Components (palette, command palette) should
// read from here instead of the static COMPONENT_REGISTRY so newly authored
// custom parts appear immediately.

import { useMemo, useSyncExternalStore } from "react"
import type { ComponentDefinition } from "@/components/component-definition"
import { COMPONENT_REGISTRY } from "@/components/catalog/manager"
import { getCustomSnapshot, subscribeCustom } from "@/components/catalog/custom-store"

export function useComponentCatalog(): ComponentDefinition[] {
  const custom = useSyncExternalStore(subscribeCustom, getCustomSnapshot, getCustomSnapshot)
  return useMemo(() => [...COMPONENT_REGISTRY, ...custom], [custom])
}

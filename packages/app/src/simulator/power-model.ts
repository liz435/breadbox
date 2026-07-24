// ── Declared power model lookup ───────────────────────────────────────────
//
// One place the simulator asks "what does this part need from the supply?".
// The answer lives on the part itself (PartSpec.power), so built-ins and
// custom DSL parts resolve through the same call and there is no side table
// to keep in agreement.
//
// Catalog modules must NOT import this — it reaches the registry, which
// imports them back. They pass their own declaration directly instead.

import { getComponentDef } from "@/components/registry"
import type { PartPowerModel } from "@/components/part-spec"

export type { PartPowerModel }

/** The part's declared supply requirement, or undefined when it has none and
 * should be left ungated rather than reported permanently unpowered. */
export function powerModelFor(type: string): PartPowerModel | undefined {
  return getComponentDef(type)?.power
}

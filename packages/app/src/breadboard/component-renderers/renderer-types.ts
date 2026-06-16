// ── Renderer props ────────────────────────────────────────────────────────
//
// Shared prop shape for every breadboard component renderer. Lives in its own
// leaf module (no dependency on the registry/manager) so it can be referenced
// by both the component definitions (catalog/) and the renderers without
// creating an import cycle.

import type { BoardComponent, PinState, LibraryState, Wire } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";

export type ComponentRendererProps = {
  component: BoardComponent;
  components?: BoardComponent[];
  pinStates: PinState[];
  wires?: Record<string, Wire>;
  isSelected: boolean;
  electricalState?: ComponentElectricalState;
  libraryState?: LibraryState;
};

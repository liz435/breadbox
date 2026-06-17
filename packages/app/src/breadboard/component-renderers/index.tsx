import React from "react";
import { isCustomComponentType } from "@dreamer/schemas";
import { getCustomDef } from "@/components/catalog/custom-store";
import { GenericRenderer } from "./generic-renderer";
import { CustomPartRenderer } from "./custom-part-renderer";
import type { ComponentRendererProps } from "./renderer-types";
// Per-component renderers are colocated with their definitions in catalog/<type>/.
// This map wires component type → renderer; types without a dedicated renderer
// fall back to the shared GenericRenderer below. (Kept out of the catalog/manager
// so the registry stays free of renderer imports — renderers pull in
// breadboard-grid, which imports the registry, which would form a cycle.)
import { LedRenderer } from "@/components/catalog/led/led-renderer";
import { RgbLedRenderer } from "@/components/catalog/rgb-led/rgb-led-renderer";
import { ButtonRenderer } from "@/components/catalog/button/button-renderer";
import { ResistorRenderer } from "@/components/catalog/resistor/resistor-renderer";
import { CapacitorRenderer } from "@/components/catalog/capacitor/capacitor-renderer";
import { IcRenderer } from "@/components/catalog/ic/ic-renderer";
import { ServoRenderer } from "@/components/catalog/servo/servo-renderer";
import { PowerSupplyRenderer } from "@/components/catalog/power-supply/power-supply-renderer";
import { MultimeterRenderer } from "@/components/catalog/multimeter/multimeter-renderer";
import { IrRemoteRenderer } from "@/components/catalog/ir-remote/ir-remote-renderer";
import { BreadboardRenderer } from "@/components/catalog/breadboard-full/breadboard-renderer";
import { PerfboardRenderer } from "@/components/catalog/perfboard-generic/perfboard-renderer";

export type { ComponentRendererProps } from "./renderer-types";

const RENDERER_MAP: Record<
  string,
  React.ComponentType<ComponentRendererProps>
> = {
  led: LedRenderer,
  rgb_led: RgbLedRenderer,
  button: ButtonRenderer,
  resistor: ResistorRenderer,
  capacitor: CapacitorRenderer,
  ic: IcRenderer,
  servo: ServoRenderer,
  power_supply: PowerSupplyRenderer,
  multimeter: MultimeterRenderer,
  ir_remote: IrRemoteRenderer,
  // arduino_uno is rendered as a fixed board, not as a component
  // breadboard_full / perfboard_generic: see the renderer files for why
  // these are stubs today. The implicit BB still owns the visual; these
  // renderers will take over once the canvas is carved out.
  breadboard_full: BreadboardRenderer,
  perfboard_generic: PerfboardRenderer,
};

export function getComponentRenderer(
  componentType: string
): React.ComponentType<ComponentRendererProps> {
  const builtIn = RENDERER_MAP[componentType];
  if (builtIn) return builtIn;
  // Custom parts use their own renderer when supplied, else the auto-box /
  // missing-part placeholder. Built-ins without a dedicated renderer use the
  // shared GenericRenderer.
  if (isCustomComponentType(componentType)) {
    return getCustomDef(componentType)?.renderer ?? CustomPartRenderer;
  }
  return GenericRenderer;
}

function ComponentRendererInner({ component, components, pinStates, wires, isSelected, electricalState, libraryState }: ComponentRendererProps) {
  const Renderer = getComponentRenderer(component.type);
  return <Renderer component={component} components={components} pinStates={pinStates} wires={wires} isSelected={isSelected} electricalState={electricalState} libraryState={libraryState} />;
}

export const ComponentRenderer = React.memo(ComponentRendererInner);

import React from "react";
import type { BoardComponent, PinState, ComponentType, LibraryState, Wire } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { LedRenderer } from "./led-renderer";
import { RgbLedRenderer } from "./rgb-led-renderer";
import { ButtonRenderer } from "./button-renderer";
import { ResistorRenderer } from "./resistor-renderer";
import { CapacitorRenderer } from "./capacitor-renderer";
import { IcRenderer } from "./ic-renderer";
import { ServoRenderer } from "./servo-renderer";
import { PowerSupplyRenderer } from "./power-supply-renderer";
import { MultimeterRenderer } from "./multimeter-renderer";
import { GenericRenderer } from "./generic-renderer";
import { BreadboardRenderer } from "./breadboard-renderer";
import { PerfboardRenderer } from "./perfboard-renderer";

export type ComponentRendererProps = {
  component: BoardComponent;
  components?: BoardComponent[];
  pinStates: PinState[];
  wires?: Record<string, Wire>;
  isSelected: boolean;
  electricalState?: ComponentElectricalState;
  libraryState?: LibraryState;
};

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
  // arduino_uno is rendered as a fixed board, not as a component
  // breadboard_full / perfboard_generic: see the renderer files for why
  // these are stubs today. The implicit BB still owns the visual; these
  // renderers will take over once the canvas is carved out.
  breadboard_full: BreadboardRenderer,
  perfboard_generic: PerfboardRenderer,
};

export function getComponentRenderer(
  componentType: ComponentType
): React.ComponentType<ComponentRendererProps> {
  return RENDERER_MAP[componentType] ?? GenericRenderer;
}

function ComponentRendererInner({ component, components, pinStates, wires, isSelected, electricalState, libraryState }: ComponentRendererProps) {
  const Renderer = getComponentRenderer(component.type);
  return <Renderer component={component} components={components} pinStates={pinStates} wires={wires} isSelected={isSelected} electricalState={electricalState} libraryState={libraryState} />;
}

export const ComponentRenderer = React.memo(ComponentRendererInner);

import React from "react";
import type { BoardComponent, PinState, ComponentType } from "@dreamer/schemas";
import { LedRenderer } from "./led-renderer";
import { ButtonRenderer } from "./button-renderer";
import { ResistorRenderer } from "./resistor-renderer";
import { ServoRenderer } from "./servo-renderer";
import { GenericRenderer } from "./generic-renderer";

export type ComponentRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
};

const RENDERER_MAP: Record<
  string,
  React.ComponentType<ComponentRendererProps>
> = {
  led: LedRenderer,
  rgb_led: LedRenderer,
  button: ButtonRenderer,
  resistor: ResistorRenderer,
  servo: ServoRenderer,
  // arduino_uno is rendered as a fixed board, not as a component
};

export function getComponentRenderer(
  componentType: ComponentType
): React.ComponentType<ComponentRendererProps> {
  return RENDERER_MAP[componentType] ?? GenericRenderer;
}

function ComponentRendererInner({ component, pinStates, isSelected }: ComponentRendererProps) {
  const Renderer = getComponentRenderer(component.type);
  return <Renderer component={component} pinStates={pinStates} isSelected={isSelected} />;
}

export const ComponentRenderer = React.memo(ComponentRendererInner);

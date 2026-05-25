import React from "react";
import type { ComponentRendererProps } from "./index";

/**
 * Stub renderer for breadboard_full components. Returns null because the
 * implicit breadboard background (StaticBackground in breadboard-canvas.tsx)
 * still owns the visual rendering for the single canonical breadboard.
 *
 * This stub exists so the COMPONENT_REGISTRY can dispatch by type once the
 * schema treats the breadboard as a placed component. The visual carve-out
 * (parameterize buildBreadboardBackground by worldX/worldY, suppress the
 * implicit background, support multi-BB rendering) is the next focused step.
 */
function BreadboardRendererInner(_props: ComponentRendererProps) {
  return null;
}

export const BreadboardRenderer = React.memo(BreadboardRendererInner);

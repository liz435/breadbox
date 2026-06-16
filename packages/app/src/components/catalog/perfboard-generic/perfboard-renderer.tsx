import React from "react";
import type { ComponentRendererProps } from "@/breadboard/component-renderers/renderer-types";

/**
 * Stub renderer for perfboard_generic components. Returns null pending the
 * Stage 3 implementation of the perfboard surface (24×18 grid, all holes
 * electrically isolated — each hole is its own strip).
 */
function PerfboardRendererInner(_props: ComponentRendererProps) {
  return null;
}

export const PerfboardRenderer = React.memo(PerfboardRendererInner);

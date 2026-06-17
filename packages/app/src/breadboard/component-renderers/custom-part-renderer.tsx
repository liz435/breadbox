// ── Custom Part Renderer ────────────────────────────────────────────────────
//
// Default visual for custom (user-authored) components that don't ship their
// own renderer: an auto-generated labeled box sized to the part's footprint,
// with a dot at each pin. When a board references a custom type whose plugin
// isn't loaded (deleted, or authored in another install), the same renderer
// draws a dashed "missing part" placeholder instead of rendering nothing.

import React from "react";
import { isCustomComponentType } from "@dreamer/schemas";
import { gridToPixel, getComponentFootprint } from "@/breadboard/breadboard-grid";
import { HOLE_SPACING } from "@/breadboard/breadboard-constants";
import { getCustomDef } from "@/components/catalog/custom-store";
import type { ComponentRendererProps } from "./renderer-types";

function CustomPartRendererInner({ component, isSelected }: ComponentRendererProps) {
  const def = getCustomDef(component.type);
  const missing = isCustomComponentType(component.type) && !def;

  const footprint = getComponentFootprint(
    component.type,
    component.y,
    component.x,
    component.rotation,
    component.properties,
  );
  const points = footprint.points.map((p) => gridToPixel(p));
  if (points.length === 0) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const pad = HOLE_SPACING / 2 + 2;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const height = Math.max(...ys) - Math.min(...ys) + pad * 2;

  const label = missing ? `⚠ ${component.type}` : def?.label ?? component.name;
  const fill = missing ? "#1f2937" : def?.accentColor ?? "#475569";
  const border = missing ? "#ef4444" : isSelected ? "#3b82f6" : "#94a3b8";

  return (
    <g>
      <rect
        x={minX}
        y={minY}
        width={width}
        height={height}
        rx={2}
        fill={fill}
        fillOpacity={missing ? 0.45 : 0.85}
        stroke={border}
        strokeWidth={isSelected ? 1.5 : 1}
        strokeDasharray={missing ? "3 2" : undefined}
      />
      {points.map((p, i) => (
        <circle
          key={`pin-${i}`}
          cx={p.x}
          cy={p.y}
          r={2}
          fill="#e2e8f0"
          stroke="#0f172a"
          strokeWidth={0.5}
        />
      ))}
      <text
        x={minX + width / 2}
        y={minY + height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={5}
        fill={missing ? "#fca5a5" : "#f8fafc"}
        fontFamily="monospace"
      >
        {label}
      </text>
    </g>
  );
}

export const CustomPartRenderer = React.memo(CustomPartRendererInner);

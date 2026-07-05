// ── Custom Part Renderer ────────────────────────────────────────────────────
//
// Visual for custom (user-authored) components that don't ship their own
// renderer. Three modes:
//   - Animated: the part declares visual.bindings — its SVG is sanitized and
//     inlined so bound elements (by id) can be rotated/translated/scaled/faded
//     from live behavior signal values (libraryState.custom[componentId]).
//   - Static: author SVG drawn via an isolated <image> data URL.
//   - Fallback: an auto-generated labeled box sized to the footprint.
// When a board references a custom type whose plugin isn't loaded (deleted, or
// authored in another install), a dashed "missing part" placeholder is drawn.

import React, { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { evaluateExpression, isCustomComponentType } from "@dreamer/schemas";
import type { DslBinding } from "@dreamer/schemas";
import { gridToPixel, getComponentFootprint } from "@/breadboard/breadboard-grid";
import { HOLE_SPACING } from "@/breadboard/breadboard-constants";
import { getCustomDef, subscribeCustom } from "@/components/catalog/custom-store";
import { svgToDataUrl } from "@/utils/svg-data-url";
import { sanitizeSvg } from "@/utils/sanitize-svg";
import type { ComponentRendererProps } from "./renderer-types";

function evalBindingValue(
  value: number | string | undefined,
  context: Record<string, number>,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  try {
    return evaluateExpression(value, context);
  } catch {
    return undefined;
  }
}

/** Apply one binding's evaluated transform/opacity to its target element. */
function applyBinding(
  el: SVGGraphicsElement,
  binding: DslBinding,
  context: Record<string, number>,
  bboxCenters: Map<string, { cx: number; cy: number }>,
): void {
  const rotate = evalBindingValue(binding.rotate, context);
  const scale = evalBindingValue(binding.scale, context);
  const translateX = evalBindingValue(binding.translateX, context) ?? 0;
  const translateY = evalBindingValue(binding.translateY, context) ?? 0;
  const opacity = evalBindingValue(binding.opacity, context);

  if (rotate !== undefined || scale !== undefined || translateX !== 0 || translateY !== 0) {
    let cx = binding.originX;
    let cy = binding.originY;
    if ((rotate !== undefined || scale !== undefined) && (cx === undefined || cy === undefined)) {
      // Default origin: the element's own untransformed center, cached — a
      // rotor spins about its hub without the author computing coordinates.
      let center = bboxCenters.get(binding.target);
      if (!center) {
        try {
          const box = el.getBBox();
          center = { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
        } catch {
          center = { cx: 0, cy: 0 };
        }
        bboxCenters.set(binding.target, center);
      }
      cx = cx ?? center.cx;
      cy = cy ?? center.cy;
    }
    const parts: string[] = [];
    if (translateX !== 0 || translateY !== 0) parts.push(`translate(${translateX} ${translateY})`);
    if (rotate !== undefined || scale !== undefined) {
      parts.push(`translate(${cx ?? 0} ${cy ?? 0})`);
      if (rotate !== undefined) parts.push(`rotate(${rotate})`);
      if (scale !== undefined) parts.push(`scale(${scale})`);
      parts.push(`translate(${-(cx ?? 0)} ${-(cy ?? 0)})`);
    }
    // The binding owns the element's transform — any static transform the
    // author put on a bound element is replaced.
    el.setAttribute("transform", parts.join(" "));
  }
  if (opacity !== undefined) {
    el.setAttribute("opacity", String(Math.min(1, Math.max(0, opacity))));
  }
}

function CustomPartRendererInner({ component, isSelected, libraryState }: ComponentRendererProps) {
  // Subscribed lookup: a part registered after mount (e.g. fetched on demand
  // when an MCP-authored board arrives) replaces the missing placeholder live.
  const def = useSyncExternalStore(
    subscribeCustom,
    () => getCustomDef(component.type),
    () => getCustomDef(component.type),
  );
  const missing = isCustomComponentType(component.type) && !def;

  // A part may supply raw SVG for its body; a missing plugin never does.
  const svg = missing ? undefined : def?.svg;
  const bindings = missing ? undefined : def?.visualBindings;
  const wantsAnimation = !!svg && !!bindings && bindings.length > 0;

  // Sanitized inline form; null (unparseable / no viewBox / no DOM) falls back
  // to the isolated <image> path, losing animation but never the visual.
  const parsed = useMemo(() => (wantsAnimation && svg ? sanitizeSvg(svg) : null), [wantsAnimation, svg]);

  // Expression context: numeric properties, then signals (zero until the sim
  // publishes values, so parts render a sane static pose before running).
  const signalValues = libraryState?.custom?.[component.id];
  const context = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(component.properties)) {
      if (typeof value === "number") out[key] = value;
    }
    for (const name of def?.signalNames ?? []) out[name] = 0;
    if (signalValues) Object.assign(out, signalValues);
    return out;
  }, [component.properties, def, signalValues]);

  const svgHostRef = useRef<SVGSVGElement>(null);
  const bboxCentersRef = useRef(new Map<string, { cx: number; cy: number }>());

  // The inlined markup is replaced whenever the SVG source changes — drop the
  // cached bbox origins with it.
  useEffect(() => {
    bboxCentersRef.current.clear();
  }, [parsed]);

  useEffect(() => {
    const host = svgHostRef.current;
    if (!host || !parsed || !bindings) return;
    for (const binding of bindings) {
      // Scoped query so multiple instances of the same part never cross-talk.
      const el = host.querySelector(`[id="${binding.target}"]`);
      if (el instanceof SVGGraphicsElement) {
        applyBinding(el, binding, context, bboxCentersRef.current);
      }
    }
  }, [parsed, bindings, context]);

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
      {svg ? (
        <>
          {parsed ? (
            /* Sanitized inline SVG: bound elements are animated by the effect
               above. Author ids stay as-authored; binding lookups are scoped
               to this subtree, and duplicate gradient ids across instances
               resolve to identical content. */
            <svg
              ref={svgHostRef}
              x={minX}
              y={minY}
              width={width}
              height={height}
              viewBox={parsed.viewBox}
              preserveAspectRatio="xMidYMid meet"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: parsed.content }}
            />
          ) : (
            /* Static author SVG, drawn via a data URL so it renders in the
               browser's restricted image mode (no scripts / external fetches). */
            <image
              x={minX}
              y={minY}
              width={width}
              height={height}
              href={svgToDataUrl(svg)}
              preserveAspectRatio="xMidYMid meet"
            />
          )}
          {isSelected && (
            <rect
              x={minX}
              y={minY}
              width={width}
              height={height}
              rx={2}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={1.5}
            />
          )}
        </>
      ) : (
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
      )}
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
      {!svg && (
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
      )}
    </g>
  );
}

export const CustomPartRenderer = React.memo(CustomPartRendererInner);

// ── Circuit Overlay ─────────────────────────────────────────────────────
//
// SVG overlay that visualizes electrical flow on the breadboard:
// - Animated current flow lines along active paths
// - Glow effects on active components
// - Red pulsing glow for reverse polarity
// - Warning indicators near problematic components

import React, { useEffect, useRef } from "react"
import type {
  CircuitAnalysis,
  ComponentElectricalState,
  CurrentPath,
  CircuitWarning,
} from "@/simulator/circuit-solver"
import { gridToPixel } from "./breadboard-grid"
import { REALISTIC_LED_LIGHTING_PILOT } from "./lighting-pilot"
import type { BoardComponent } from "@dreamer/schemas"

type CircuitOverlayProps = {
  analysis: CircuitAnalysis
  components: BoardComponent[]
}

// ── Shared SVG filter definitions ──────────────────────────────────

function SharedFilterDefs() {
  return (
    <defs>
      <filter id="circuit-reverse-glow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="circuit-active-glow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}

// ── Animated current flow line ──────────────────────────────────────

// Peak dot speed in px/s, reached at full intensity. Flow speed scales with
// current so the dots visibly slow as the current drops — staying in sync with
// a dimming LED during a capacitor discharge instead of zipping at a fixed rate.
const FLOW_MAX_SPEED = 70

function CurrentFlowLine({ path }: { path: CurrentPath }) {
  // Animate stroke-dashoffset by hand via rAF (not SMIL) so the speed can
  // track the live current smoothly. SMIL's `dur` can't change without
  // restarting the animation, which is what made the dots ignore the LED.
  const dashRef = useRef<SVGPathElement>(null)
  const intensityRef = useRef(0)
  const offsetRef = useRef(0)
  const rafRef = useRef(0)
  const lastTsRef = useRef(0)

  useEffect(() => {
    function tick(ts: number) {
      const last = lastTsRef.current || ts
      const dt = Math.min((ts - last) / 1000, 0.1)
      lastTsRef.current = ts
      // Dots move faster with more current, slow to a crawl as it fades.
      offsetRef.current -= FLOW_MAX_SPEED * intensityRef.current * dt
      if (offsetRef.current <= -1000) offsetRef.current += 1000
      if (dashRef.current) {
        dashRef.current.style.strokeDashoffset = String(offsetRef.current)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  if (path.points.length < 2) return null

  const d = path.points
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
    .join(" ")

  const intensity = Math.min(1, path.current / 20)
  intensityRef.current = intensity
  const strokeWidth = 1 + intensity * 2

  return (
    <g>
      {/* Glow underlay */}
      <path
        d={d}
        fill="none"
        stroke="#fbbf24"
        strokeWidth={strokeWidth + 2}
        strokeLinecap="round"
        opacity={0.15 * intensity}
      />
      {/* Dashed line — offset animated in the rAF loop above. Opacity tracks
          intensity (= the LED's brightness formula) so it fades in lock-step. */}
      <path
        ref={dashRef}
        d={d}
        fill="none"
        stroke="#fde68a"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray="4 6"
        opacity={0.15 + 0.55 * intensity}
      />
    </g>
  )
}

// ── Reverse polarity warning glow ───────────────────────────────────

function ReversePolarityGlow({
  component,
}: {
  component: BoardComponent
}) {
  const pos = gridToPixel({ row: component.y, col: component.x })

  return (
    <circle
      cx={pos.x}
      cy={pos.y}
      r={12}
      fill="#ef4444"
      opacity={0.3}
      filter="url(#circuit-reverse-glow)"
    >
      <animate
        attributeName="opacity"
        values="0.15;0.4;0.15"
        dur="1s"
        repeatCount="indefinite"
      />
    </circle>
  )
}

// ── Active component glow ───────────────────────────────────────────

function ActiveComponentGlow({
  component,
  electricalState,
}: {
  component: BoardComponent
  electricalState: ComponentElectricalState
}) {
  if (!electricalState.isActive) return null

  const pos = gridToPixel({ row: component.y, col: component.x })
  const color =
    component.type === "led" || component.type === "rgb_led"
      ? ((component.properties.color as string) ?? "#ef4444")
      : "#fbbf24"

  const radius = 8 + electricalState.brightness * 6

  return (
    <circle
      cx={pos.x}
      cy={pos.y}
      r={radius}
      fill={color}
      opacity={0.15 + electricalState.brightness * 0.25}
      filter="url(#circuit-active-glow)"
    >
      <animate
        attributeName="r"
        values={`${radius};${radius + 3};${radius}`}
        dur="1.5s"
        repeatCount="indefinite"
      />
      <animate
        attributeName="opacity"
        values={`${0.15 + electricalState.brightness * 0.25};${0.1 + electricalState.brightness * 0.15};${0.15 + electricalState.brightness * 0.25}`}
        dur="1.5s"
        repeatCount="indefinite"
      />
    </circle>
  )
}

// ── Warning indicator ───────────────────────────────────────────────

function WarningIndicator({
  warning,
  component,
}: {
  warning: CircuitWarning
  component: BoardComponent | undefined
}) {
  if (!component) return null

  const pos = gridToPixel({ row: component.y, col: component.x })

  return (
    <g>
      <circle
        cx={pos.x + 12}
        cy={pos.y - 12}
        r={5}
        fill="#f59e0b"
        stroke="#92400e"
        strokeWidth={0.5}
      />
      <text
        x={pos.x + 12}
        y={pos.y - 9}
        textAnchor="middle"
        fontSize={7}
        fill="#92400e"
        fontWeight="bold"
        pointerEvents="none"
      >
        !
      </text>
      {/* Tooltip on hover — using SVG title */}
      <title>{warning.message}</title>
    </g>
  )
}

// ── Main overlay ────────────────────────────────────────────────────

function CircuitOverlayInner({ analysis, components }: CircuitOverlayProps) {
  const componentMap = new Map(components.map((c) => [c.id, c]))

  return (
    <g className="circuit-overlay" pointerEvents="none">
      {/* Shared filter definitions — only 2 filters for all components */}
      <SharedFilterDefs />

      {/* Current flow animations */}
      {analysis.currentPaths.map((path, i) => (
        <CurrentFlowLine key={`flow-${i}`} path={path} />
      ))}

      {/* Active component glows */}
      {Array.from(analysis.componentStates.entries()).map(([id, state]) => {
        const comp = componentMap.get(id)
        if (!comp) return null

        if (state.isReversed) {
          return <ReversePolarityGlow key={`rev-${id}`} component={comp} />
        }

        const usesSelfRenderedLighting =
          (comp.type === "led" && REALISTIC_LED_LIGHTING_PILOT) ||
          comp.type === "rgb_led"

        if (state.isActive && !usesSelfRenderedLighting) {
          return (
            <ActiveComponentGlow
              key={`glow-${id}`}
              component={comp}
              electricalState={state}
            />
          )
        }

        return null
      })}

      {/* Warning indicators */}
      {analysis.warnings.map((warning, i) => (
        <WarningIndicator
          key={`warn-${i}`}
          warning={warning}
          component={componentMap.get(warning.componentId)}
        />
      ))}
    </g>
  )
}

export const CircuitOverlay = React.memo(CircuitOverlayInner)

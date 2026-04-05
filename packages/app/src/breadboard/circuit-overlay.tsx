// ── Circuit Overlay ─────────────────────────────────────────────────────
//
// SVG overlay that visualizes electrical flow on the breadboard:
// - Animated current flow lines along active paths
// - Glow effects on active components
// - Red pulsing glow for reverse polarity
// - Warning indicators near problematic components

import React from "react"
import type {
  CircuitAnalysis,
  ComponentElectricalState,
  CurrentPath,
  CircuitWarning,
} from "@/simulator/circuit-solver"
import { gridToPixel } from "./breadboard-grid"
import type { BoardComponent } from "@dreamer/schemas"

type CircuitOverlayProps = {
  analysis: CircuitAnalysis
  components: BoardComponent[]
}

// ── Animated current flow line ──────────────────────────────────────

function CurrentFlowLine({ path }: { path: CurrentPath }) {
  if (path.points.length < 2) return null

  const d = path.points
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
    .join(" ")

  const intensity = Math.min(1, path.current / 20)
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
      {/* Animated dashed line */}
      <path
        d={d}
        fill="none"
        stroke="#fde68a"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray="4 6"
        opacity={0.5 + 0.5 * intensity}
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-20"
          dur="0.6s"
          repeatCount="indefinite"
        />
      </path>
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
  const filterId = `reverse-glow-${component.id}`

  return (
    <g>
      <defs>
        <filter id={filterId} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle
        cx={pos.x}
        cy={pos.y}
        r={12}
        fill="#ef4444"
        opacity={0.3}
        filter={`url(#${filterId})`}
      >
        <animate
          attributeName="opacity"
          values="0.15;0.4;0.15"
          dur="1s"
          repeatCount="indefinite"
        />
      </circle>
    </g>
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

  const filterId = `active-glow-${component.id}`
  const radius = 8 + electricalState.brightness * 6

  return (
    <g>
      <defs>
        <filter id={filterId} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur
            stdDeviation={3 + electricalState.brightness * 4}
            result="blur"
          />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle
        cx={pos.x}
        cy={pos.y}
        r={radius}
        fill={color}
        opacity={0.15 + electricalState.brightness * 0.25}
        filter={`url(#${filterId})`}
      />
    </g>
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

        if (state.isActive) {
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

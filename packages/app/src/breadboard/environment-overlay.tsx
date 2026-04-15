// ── Environment Overlay ───────────────────────────────────────────────────
//
// SVG overlay that renders obstacles and the ultrasonic sensor beam on
// the breadboard canvas. Obstacles are drawn as semi-transparent shapes
// and the sensor ray is shown as a dashed line to the nearest hit point.

import React, { useMemo } from "react"
import type { BoardComponent, Environment } from "@dreamer/schemas"
import {
  sensorRay,
  raycastDistance,
  environmentToSegments,
  pixelsToCm,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "@/simulator/ray-cast"

type EnvironmentOverlayProps = {
  environment: Environment
  components: BoardComponent[]
}

export function EnvironmentOverlay({ environment, components }: EnvironmentOverlayProps) {
  const segments = useMemo(
    () => environmentToSegments(environment, CANVAS_WIDTH, CANVAS_HEIGHT),
    [environment],
  )

  // Compute ray hits for all ultrasonic sensors
  const sensorBeams = useMemo(() => {
    const beams: Array<{
      ox: number; oy: number
      hx: number; hy: number
      distCm: number
      inRange: boolean
    }> = []

    for (const comp of components) {
      if (comp.type !== "ultrasonic_sensor") continue
      if (segments.length === 0) continue

      const ray = sensorRay(comp)
      const dist = raycastDistance(ray, segments)
      const cm = pixelsToCm(dist)
      const inRange = isFinite(dist) && cm <= 400

      const hitDist = inRange ? dist : Math.min(dist, 800) // cap visual beam length
      beams.push({
        ox: ray.ox,
        oy: ray.oy,
        hx: ray.ox + ray.dx * hitDist,
        hy: ray.oy + ray.dy * hitDist,
        distCm: inRange ? Math.round(cm * 10) / 10 : -1,
        inRange,
      })
    }
    return beams
  }, [components, segments])

  const hasObstacles = Object.keys(environment.obstacles).length > 0
  if (!hasObstacles && !environment.boundaryEnabled) return null

  return (
    <g className="environment-overlay" pointerEvents="none">
      {/* Render user-placed obstacles */}
      {Object.values(environment.obstacles).map((obs) => {
        if (obs.shape === "wall") {
          return (
            <line
              key={obs.id}
              x1={obs.x1}
              y1={obs.y1}
              x2={obs.x2}
              y2={obs.y2}
              stroke="#f59e0b"
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.6}
            />
          )
        }
        // box
        return (
          <rect
            key={obs.id}
            x={Math.min(obs.x1, obs.x2)}
            y={Math.min(obs.y1, obs.y2)}
            width={Math.abs(obs.x2 - obs.x1)}
            height={Math.abs(obs.y2 - obs.y1)}
            fill="#f59e0b"
            fillOpacity={0.15}
            stroke="#f59e0b"
            strokeWidth={1.5}
            opacity={0.6}
            rx={2}
          />
        )
      })}

      {/* Render obstacle labels */}
      {Object.values(environment.obstacles).map((obs) => {
        if (!obs.label) return null
        const cx = (obs.x1 + obs.x2) / 2
        const cy = (obs.y1 + obs.y2) / 2
        return (
          <text
            key={`label-${obs.id}`}
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fill="#f59e0b"
            fontSize={5}
            fontFamily="monospace"
            opacity={0.8}
          >
            {obs.label}
          </text>
        )
      })}

      {/* Render sensor beams */}
      {sensorBeams.map((beam, i) => (
        <g key={`beam-${i}`}>
          {/* Beam line */}
          <line
            x1={beam.ox}
            y1={beam.oy}
            x2={beam.hx}
            y2={beam.hy}
            stroke={beam.inRange ? "#06b6d4" : "#ef4444"}
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.7}
          />
          {/* Hit point marker */}
          {beam.inRange && (
            <>
              <circle
                cx={beam.hx}
                cy={beam.hy}
                r={3}
                fill={beam.distCm < 15 ? "#ef4444" : beam.distCm < 60 ? "#f59e0b" : "#06b6d4"}
                opacity={0.8}
              />
              {/* Distance label at hit point */}
              <text
                x={beam.hx}
                y={beam.hy - 6}
                textAnchor="middle"
                fill="#06b6d4"
                fontSize={5}
                fontFamily="monospace"
                opacity={0.9}
              >
                {beam.distCm} cm
              </text>
            </>
          )}
        </g>
      ))}
    </g>
  )
}

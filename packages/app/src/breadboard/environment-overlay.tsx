// ── Environment Overlay ───────────────────────────────────────────────────
//
// SVG overlay that renders obstacles and the ultrasonic sensor beam on
// the breadboard canvas. Obstacles (walls and boxes) are draggable: press
// and hold an obstacle to translate it across the canvas. The sensor
// ray-cast re-evaluates live against the dragged position.

import React, { useCallback, useMemo, useRef, useState } from "react"
import type { BoardComponent, Environment, Obstacle } from "@dreamer/schemas"
import { BoardContext } from "@/store/board-context"
import {
  sensorRay,
  raycastDistance,
  environmentToSegments,
  pixelsToCm,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "@/simulator/ray-cast"
import { screenToBoard } from "./breadboard-camera"

type EnvironmentOverlayProps = {
  environment: Environment
  components: BoardComponent[]
}

type DragState = {
  id: string
  pointerId: number
  startPointerX: number
  startPointerY: number
  startX1: number
  startY1: number
  startX2: number
  startY2: number
}

export function EnvironmentOverlay({ environment, components }: EnvironmentOverlayProps) {
  const send = BoardContext.useActorRef().send

  const dragRef = useRef<DragState | null>(null)
  // Live offset of the currently-dragged obstacle. Kept in local state so
  // the overlay (and derived sensor beams) re-renders during drag without
  // writing to the board store on every pointer move.
  const [dragOffset, setDragOffset] = useState<{ id: string; dx: number; dy: number } | null>(null)

  // Obstacles belong to the environment, not the component graph, so
  // selecting an obstacle id leaves the inspector empty. Route the click
  // to the first ultrasonic sensor on the board instead — its inspector
  // panel *is* the environment editor (live distance, obstacle list,
  // room-walls toggle), so the user sees the info they expect.
  const ultrasonicSensorId = useMemo(
    () => components.find((c) => c.type === "ultrasonic_sensor")?.id ?? null,
    [components],
  )

  // Apply the live drag offset to the obstacle map so we render — and
  // ray-cast against — the previewed position.
  const displayObstacles = useMemo(() => {
    const all = Object.values(environment.obstacles)
    if (!dragOffset) return all
    return all.map((obs) =>
      obs.id === dragOffset.id
        ? {
            ...obs,
            x1: obs.x1 + dragOffset.dx,
            y1: obs.y1 + dragOffset.dy,
            x2: obs.x2 + dragOffset.dx,
            y2: obs.y2 + dragOffset.dy,
          }
        : obs,
    )
  }, [environment.obstacles, dragOffset])

  const displayEnvironment = useMemo<Environment>(
    () =>
      dragOffset
        ? {
            ...environment,
            obstacles: Object.fromEntries(displayObstacles.map((o) => [o.id, o])),
          }
        : environment,
    [environment, displayObstacles, dragOffset],
  )

  const segments = useMemo(
    () => environmentToSegments(displayEnvironment, CANVAS_WIDTH, CANVAS_HEIGHT),
    [displayEnvironment],
  )

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

      const hitDist = inRange ? dist : Math.min(dist, 800)
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

  // ── Drag handlers ────────────────────────────────────────────────────────
  //
  // Pointer events are captured on the obstacle element itself so subsequent
  // move/up events keep flowing there regardless of what's under the cursor.
  // stopPropagation() prevents the canvas from starting an area-select.

  const handlePointerDown = useCallback(
    (obs: Obstacle) => (e: React.PointerEvent<SVGElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const svg = e.currentTarget.ownerSVGElement
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top)
      dragRef.current = {
        id: obs.id,
        pointerId: e.pointerId,
        startPointerX: board.x,
        startPointerY: board.y,
        startX1: obs.x1,
        startY1: obs.y1,
        startX2: obs.x2,
        startY2: obs.y2,
      }
      setDragOffset({ id: obs.id, dx: 0, dy: 0 })
      e.currentTarget.setPointerCapture(e.pointerId)
      // Prefer selecting the ultrasonic sensor so the inspector renders
      // UltrasonicInspector (live distance, obstacle list, room walls). Fall
      // back to selecting the obstacle id if no sensor is on the board —
      // inspector then shows the empty placeholder, same as today.
      send({ type: "SELECT", id: ultrasonicSensorId ?? obs.id })
    },
    [send, ultrasonicSensorId],
  )

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top)
    setDragOffset({
      id: drag.id,
      dx: board.x - drag.startPointerX,
      dy: board.y - drag.startPointerY,
    })
  }, [])

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      const offset = dragOffset
      dragRef.current = null
      setDragOffset(null)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // already released — ignore
      }
      if (!offset || (offset.dx === 0 && offset.dy === 0)) return
      send({
        type: "UPDATE_OBSTACLE",
        id: drag.id,
        changes: {
          x1: drag.startX1 + offset.dx,
          y1: drag.startY1 + offset.dy,
          x2: drag.startX2 + offset.dx,
          y2: drag.startY2 + offset.dy,
        },
      })
    },
    [dragOffset, send],
  )

  const hasObstacles = displayObstacles.length > 0
  if (!hasObstacles && !environment.boundaryEnabled) return null

  return (
    <g className="environment-overlay">
      {/* Render user-placed obstacles (interactive) */}
      {displayObstacles.map((obs) => {
        const isDragging = dragOffset?.id === obs.id
        const commonProps = {
          onPointerDown: handlePointerDown(obs),
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          style: { cursor: isDragging ? "grabbing" : "grab" } as React.CSSProperties,
        }
        if (obs.shape === "wall") {
          return (
            <g key={obs.id}>
              {/* Invisible thick hit area so thin walls are easy to grab */}
              <line
                x1={obs.x1}
                y1={obs.y1}
                x2={obs.x2}
                y2={obs.y2}
                stroke="transparent"
                strokeWidth={12}
                strokeLinecap="round"
                {...commonProps}
              />
              <line
                x1={obs.x1}
                y1={obs.y1}
                x2={obs.x2}
                y2={obs.y2}
                stroke="#f59e0b"
                strokeWidth={3}
                strokeLinecap="round"
                opacity={isDragging ? 0.9 : 0.6}
                pointerEvents="none"
              />
            </g>
          )
        }
        const x = Math.min(obs.x1, obs.x2)
        const y = Math.min(obs.y1, obs.y2)
        const w = Math.abs(obs.x2 - obs.x1)
        const h = Math.abs(obs.y2 - obs.y1)
        return (
          <rect
            key={obs.id}
            x={x}
            y={y}
            width={w}
            height={h}
            fill="#f59e0b"
            fillOpacity={isDragging ? 0.25 : 0.15}
            stroke="#f59e0b"
            strokeWidth={isDragging ? 2 : 1.5}
            opacity={isDragging ? 0.9 : 0.6}
            rx={2}
            {...commonProps}
          />
        )
      })}

      {/* Labels (non-interactive so they don't steal pointer events) */}
      {displayObstacles.map((obs) => {
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
            pointerEvents="none"
          >
            {obs.label}
          </text>
        )
      })}

      {/* Sensor beams (non-interactive) */}
      <g pointerEvents="none">
        {sensorBeams.map((beam, i) => (
          <g key={`beam-${i}`}>
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
            {beam.inRange && (
              <>
                <circle
                  cx={beam.hx}
                  cy={beam.hy}
                  r={3}
                  fill={beam.distCm < 15 ? "#ef4444" : beam.distCm < 60 ? "#f59e0b" : "#06b6d4"}
                  opacity={0.8}
                />
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
    </g>
  )
}

// ── Schematic Panel ────────────────────────────────────────────────────
//
// Dockview panel that renders an auto-generated circuit schematic
// from the current breadboard state. Read-only with zoom/pan.

import React, { useMemo, useState, useCallback, useRef } from "react"
import { useBoardSelector, BoardContext } from "@/store/board-context"
import { useCircuitAnalysis } from "@/simulator/circuit-analysis-hook"
import { generateSchematicLayout } from "./schematic-layout"
import { SchematicRenderer } from "./schematic-renderer"
import { clamp } from "@/utils/math"

const MIN_ZOOM = 0.2
const MAX_ZOOM = 5

function SchematicPanelInner() {
  const components = useBoardSelector((ctx) => ctx.components)
  const wires = useBoardSelector((ctx) => ctx.wires)
  const selectedId = useBoardSelector((ctx) => ctx.selectedId)
  const boardSend = BoardContext.useActorRef().send
  const { analysis } = useCircuitAnalysis()

  const layout = useMemo(
    () => generateSchematicLayout(components, wires),
    [components, wires],
  )

  // Camera state
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })

  const hasComponents = layout.nodes.length > 0

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    setZoom((prev) => {
      const newZoom = clamp(prev * (e.deltaY < 0 ? 1.1 : 0.9), MIN_ZOOM, MAX_ZOOM)

      // Zoom toward mouse position
      const scale = newZoom / prev
      setOffset((prevOff) => ({
        x: mouseX - scale * (mouseX - prevOff.x),
        y: mouseY - scale * (mouseY - prevOff.y),
      }))

      return newZoom
    })
  }, [])

  // Pan via middle-click or left-click drag on empty space
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      // Only start panning if clicking on the SVG background, not a component
      if (e.target === e.currentTarget) {
        isPanningRef.current = true
        lastMouseRef.current = { x: e.clientX, y: e.clientY }
      }
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current) return
    const dx = e.clientX - lastMouseRef.current.x
    const dy = e.clientY - lastMouseRef.current.y
    lastMouseRef.current = { x: e.clientX, y: e.clientY }
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
  }, [])

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false
  }, [])

  const handleReset = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const handleZoomIn = useCallback(() => {
    setZoom((z) => clamp(z * 1.25, MIN_ZOOM, MAX_ZOOM))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((z) => clamp(z / 1.25, MIN_ZOOM, MAX_ZOOM))
  }, [])

  if (!hasComponents) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-900">
        <p className="text-sm text-zinc-500">
          Place components on the breadboard to see the schematic
        </p>
      </div>
    )
  }

  const btnBase =
    "flex h-8 w-8 items-center justify-center rounded-md text-lg font-bold border shadow-md"
  const btnNormal =
    "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:bg-zinc-600 border-zinc-700"

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-zinc-900">
      {/* Title overlay */}
      <div className="pointer-events-none absolute left-3 top-3 z-10">
        <span className="text-xs font-medium text-zinc-500">Schematic</span>
      </div>

      {/* SVG canvas with zoom/pan */}
      <svg
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g transform={`translate(${offset.x}, ${offset.y}) scale(${zoom})`}>
          <SchematicRenderer
            layout={layout}
            analysis={analysis}
            selectedComponentId={selectedId}
            onSelectComponent={(id) => boardSend({ type: "SELECT", id })}
          />
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={handleZoomIn}
          className={`${btnBase} ${btnNormal}`}
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className={`${btnBase} ${btnNormal}`}
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={handleReset}
          className={`${btnBase} ${btnNormal} !text-xs`}
          title="Reset zoom"
        >
          1:1
        </button>
      </div>
    </div>
  )
}

export const SchematicPanel = React.memo(SchematicPanelInner)

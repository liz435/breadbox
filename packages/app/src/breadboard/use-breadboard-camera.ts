// ── Breadboard Camera Hook ──────────────────────────────────────────────
//
// Encapsulates zoom (wheel), pan (middle-click / space / pan-mode),
// and camera-related keyboard handling. Returns the current camera state
// and stable event handlers that the SVG element can attach directly.

import { useCallback, useRef } from "react"
import React from "react"
import {
  getCamera,
  setCamera,
  zoomAtPoint,
} from "./breadboard-camera"

type UseBreadboardCameraOptions = {
  svgRef: React.RefObject<SVGSVGElement | null>
  panMode?: boolean
}

export function useBreadboardCamera({ svgRef, panMode }: UseBreadboardCameraOptions) {
  const isPanningRef = useRef(false)
  const lastPanRef = useRef({ x: 0, y: 0 })
  const spaceDownRef = useRef(false)

  // Force re-render when camera changes
  const [, setTick] = React.useState(0)
  const forceUpdate = useCallback(() => setTick((t) => t + 1), [])

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault()
      const cam = getCamera()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      zoomAtPoint(sx, sy, cam.zoom * factor)
      forceUpdate()
    },
    [forceUpdate, svgRef],
  )

  /** Call from the unified pointerDown handler when pan should start. */
  const startPan = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      isPanningRef.current = true
      lastPanRef.current = { x: e.clientX, y: e.clientY }
      svgRef.current?.setPointerCapture(e.pointerId)
    },
    [svgRef],
  )

  /** Returns true if the pointer-down event should be consumed as a pan start. */
  const shouldStartPan = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): boolean => {
      return e.button === 1 || spaceDownRef.current || !!panMode
    },
    [panMode],
  )

  /** Call from the unified pointerMove handler. Returns true if the event was consumed. */
  const handlePanMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): boolean => {
      if (!isPanningRef.current) return false
      const cam = getCamera()
      const dx = e.clientX - lastPanRef.current.x
      const dy = e.clientY - lastPanRef.current.y
      setCamera({ offsetX: cam.offsetX + dx, offsetY: cam.offsetY + dy })
      lastPanRef.current = { x: e.clientX, y: e.clientY }
      forceUpdate()
      return true
    },
    [forceUpdate],
  )

  const stopPan = useCallback(() => {
    isPanningRef.current = false
  }, [])

  /** Attach to window keydown/keyup for space-to-pan. */
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === "Space") spaceDownRef.current = true
  }, [])

  const onKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === "Space") {
      spaceDownRef.current = false
      isPanningRef.current = false
    }
  }, [])

  return {
    camera: getCamera(),
    forceUpdate,
    handleWheel,
    shouldStartPan,
    startPan,
    handlePanMove,
    stopPan,
    onKeyDown,
    onKeyUp,
    spaceDownRef,
  }
}

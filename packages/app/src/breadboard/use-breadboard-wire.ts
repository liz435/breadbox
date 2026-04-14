// ── Breadboard Wire Hook ────────────────────────────────────────────────
//
// Encapsulates wire-drawing interactions: both breadboard hole-to-hole
// wiring and Arduino-pin-to-breadboard wiring. Reads ghost/wire-start
// state from the interaction machine — no duplicate useState.

import { useCallback } from "react"
import React from "react"
import { useSelector } from "@xstate/react"
import type { ArduinoPinInfo } from "./breadboard-grid"
import type { BoardEvent } from "@/store/board-machine"
import type { BoardTarget } from "@dreamer/schemas"
import { screenToBoard } from "./breadboard-camera"
import { pixelToGrid } from "./breadboard-grid"
import { breadboardInteractionActor } from "./breadboard-interaction"

/** Wire color based on Arduino pin category. */
export function getWireColorForPin(pin: ArduinoPinInfo): string {
  if (pin.label === "GND") return "#42a5f5"
  if (pin.label === "5V" || pin.label === "3V3" || pin.label === "3.3V" || pin.label === "VIN") return "#ef5350"
  if (pin.category === "power") return "#9e9e9e"
  if (pin.isPwm) return "#ff9800"
  if (pin.category === "analog") return "#81c784"
  return "#ffd54f"
}

type UseBreadboardWireOptions = {
  svgRef: React.RefObject<SVGSVGElement | null>
  send: (event: BoardEvent) => void
  boardTarget: BoardTarget
}

export function useBreadboardWire({
  svgRef,
  send,
  boardTarget,
}: UseBreadboardWireOptions) {
  // Read ghost position from the interaction machine
  const ghostPos = useSelector(
    breadboardInteractionActor,
    (snap) => {
      const { mode, gridRow, gridCol } = snap.context
      if ((mode === "placing" || mode === "wiring_from_pin") && gridRow != null && gridCol != null) {
        return { row: gridRow, col: gridCol }
      }
      return null
    },
  )

  // Placing rotation from the machine
  const placingRotation = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.placingRotation,
  )

  // Wire start point from the machine
  const wireStart = useSelector(
    breadboardInteractionActor,
    (snap) => {
      if (snap.context.wireStartSet && snap.context.fromRow != null && snap.context.fromCol != null) {
        return { row: snap.context.fromRow, col: snap.context.fromCol }
      }
      return null
    },
  )

  // Interaction mode & placing type
  const interactionMode = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.mode,
  )
  const placingType = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.componentType,
  )
  const wiringFromPin = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.wireFromPin,
  )
  const wireFromPos = useSelector(
    breadboardInteractionActor,
    (snap) => ({ x: snap.context.wireFromX, y: snap.context.wireFromY }),
  )

  const handleStartWireFromPin = useCallback((pin: ArduinoPinInfo) => {
    breadboardInteractionActor.send({
      type: "START_WIRE_FROM_PIN",
      pin,
      pinX: pin.x,
      pinY: pin.y,
    })
  }, [])

  /**
   * Handle pointer-down for wire/component placement.
   * Returns true if the event was consumed.
   */
  const handlePlacementPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): boolean => {
      const snap = breadboardInteractionActor.getSnapshot()
      const { mode, componentType } = snap.context

      // --- Wire placement (hole-to-hole) ---
      if (e.button === 0 && mode === "placing" && componentType === "wire") {
        const rect = svgRef.current?.getBoundingClientRect()
        if (!rect) return true
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top)
        const grid = pixelToGrid(board.x, board.y)

        if (!snap.context.wireStartSet) {
          // First click — set wire start
          breadboardInteractionActor.send({
            type: "SET_WIRE_START",
            row: grid.row,
            col: grid.col,
          })
        } else {
          // Second click — create wire
          const startRow = snap.context.fromRow!
          const startCol = snap.context.fromCol!
          if (startRow !== grid.row || startCol !== grid.col) {
            send({
              type: "ADD_WIRE",
              wire: {
                id: crypto.randomUUID(),
                fromRow: startRow,
                fromCol: startCol,
                toRow: grid.row,
                toCol: grid.col,
                color: "#fbbf24",
              },
            })
          }
          breadboardInteractionActor.send({ type: "POINTER_UP" })
        }
        return true
      }

      // --- Wire from Arduino pin to breadboard hole ---
      if (e.button === 0 && mode === "wiring_from_pin" && snap.context.wireFromPin) {
        const rect = svgRef.current?.getBoundingClientRect()
        if (!rect) return true
        const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top)
        const grid = pixelToGrid(board.x, board.y)

        const currentWiringPin = snap.context.wireFromPin
        send({
          type: "ADD_WIRE",
          wire: {
            id: crypto.randomUUID(),
            fromRow: -999,
            fromCol: currentWiringPin.pin,
            fromBoardTarget: boardTarget,
            fromPinLabel: currentWiringPin.label,
            fromPinCategory: currentWiringPin.category,
            toRow: grid.row,
            toCol: grid.col,
            color: getWireColorForPin(currentWiringPin),
          },
        })

        breadboardInteractionActor.send({ type: "POINTER_UP" })
        return true
      }

      return false
    },
    [boardTarget, send, svgRef],
  )

  /** Call from unified pointerMove. Returns true if consumed. */
  const handlePlacementMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): boolean => {
      const snap = breadboardInteractionActor.getSnapshot()
      const { mode } = snap.context
      if (mode !== "placing" && mode !== "wiring_from_pin") return false

      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return true
      const board = screenToBoard(e.clientX - rect.left, e.clientY - rect.top)
      const grid = pixelToGrid(board.x, board.y)
      breadboardInteractionActor.send({
        type: "POINTER_MOVE",
        x: board.x,
        y: board.y,
        gridRow: grid.row,
        gridCol: grid.col,
      })
      return true
    },
    [svgRef],
  )

  const cancelPlacement = useCallback(() => {
    const snap = breadboardInteractionActor.getSnapshot()
    if (snap.context.mode !== "idle") {
      breadboardInteractionActor.send({ type: "CANCEL" })
    }
  }, [])

  const rotatePlacement = useCallback(() => {
    breadboardInteractionActor.send({ type: "ROTATE" })
  }, [])

  return {
    ghostPos,
    wireStart,
    placingRotation,
    interactionMode,
    placingType,
    wiringFromPin,
    wireFromPos,
    handleStartWireFromPin,
    handlePlacementPointerDown,
    handlePlacementMove,
    cancelPlacement,
    rotatePlacement,
    getWireColorForPin,
  }
}

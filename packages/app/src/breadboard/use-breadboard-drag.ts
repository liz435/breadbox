// ── Breadboard Drag Hook ────────────────────────────────────────────────
//
// Encapsulates component-drag gesture: pointer capture, grid position
// tracking via the interaction machine, and final MOVE_COMPONENT dispatch.

import { useCallback } from "react"
import React from "react"
import { useSelector } from "@xstate/react"
import type { BoardComponent } from "@dreamer/schemas"
import type { BoardEvent } from "@/store/board-machine"
import { screenToBoard } from "./breadboard-camera"
import { pixelToGrid } from "./breadboard-grid"
import { breadboardInteractionActor } from "./breadboard-interaction"

type UseBreadboardDragOptions = {
  svgRef: React.RefObject<SVGSVGElement | null>
  components: Record<string, BoardComponent>
  send: (event: BoardEvent) => void
}

export function useBreadboardDrag({
  svgRef,
  components,
  send,
}: UseBreadboardDragOptions) {
  // Read drag state from the interaction machine
  const draggingId = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.mode === "dragging" ? snap.context.componentId : null,
  )
  const dragGhostRow = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.mode === "dragging" ? snap.context.gridRow : null,
  )
  const dragGhostCol = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.mode === "dragging" ? snap.context.gridCol : null,
  )
  const dragStartRow = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.dragStartRow,
  )
  const dragStartCol = useSelector(
    breadboardInteractionActor,
    (snap) => snap.context.dragStartCol,
  )

  const dragGhost = draggingId != null && dragGhostRow != null && dragGhostCol != null
    ? { row: dragGhostRow, col: dragGhostCol }
    : null

  const handleDragStart = useCallback(
    (id: string, e: React.PointerEvent) => {
      const mode = breadboardInteractionActor.getSnapshot().context.mode
      if (mode !== "idle") return
      const comp = components[id]
      if (!comp) return
      send({ type: "SELECT", id })
      breadboardInteractionActor.send({
        type: "START_DRAG",
        componentId: id,
        offsetX: 0,
        offsetY: 0,
        startRow: comp.y,
        startCol: comp.x,
      })
      svgRef.current?.setPointerCapture(e.pointerId)
    },
    [components, send, svgRef],
  )

  /** Call from unified pointerMove. Returns true if consumed. */
  const handleDragMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): boolean => {
      const snap = breadboardInteractionActor.getSnapshot()
      if (snap.context.mode !== "dragging") return false
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

  const handleDragEnd = useCallback(() => {
    const snap = breadboardInteractionActor.getSnapshot()
    if (snap.context.mode !== "dragging") return
    const { componentId, gridRow, gridCol, dragStartRow: sRow, dragStartCol: sCol } = snap.context
    if (componentId && gridRow != null && gridCol != null && (gridRow !== sRow || gridCol !== sCol)) {
      send({ type: "MOVE_COMPONENT", id: componentId, x: gridCol, y: gridRow })
    }
    breadboardInteractionActor.send({ type: "POINTER_UP" })
  }, [send])

  const cancelDrag = useCallback(() => {
    const snap = breadboardInteractionActor.getSnapshot()
    if (snap.context.mode === "dragging") {
      breadboardInteractionActor.send({ type: "CANCEL" })
    }
  }, [])

  return {
    draggingId,
    dragGhost,
    dragStartRow,
    dragStartCol,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    cancelDrag,
  }
}

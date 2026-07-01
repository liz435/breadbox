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
import {
  pixelToGrid,
  BREADBOARD_OFFSET_X,
  BREADBOARD_WIDTH,
  BREADBOARD_HEIGHT,
} from "./breadboard-grid"
import { breadboardInteractionActor } from "./breadboard-interaction"

type UseBreadboardDragOptions = {
  svgRef: React.RefObject<SVGSVGElement | null>
  components: Record<string, BoardComponent>
  /**
   * Surface boards (breadboard_full / perfboard_generic) in the scene.
   * On drag end, if the cursor's release position is inside a board's
   * AABB that differs from the component's current parentId, the
   * component is re-parented to that board.
   */
  surfaceBoards: BoardComponent[]
  send: (event: BoardEvent) => void
}

/** Find the surface board whose AABB contains a world point. */
export function boardAtPoint(
  worldX: number,
  worldY: number,
  boards: BoardComponent[],
): BoardComponent | null {
  for (const b of boards) {
    const left = (b.worldX ?? 0) + BREADBOARD_OFFSET_X
    const right = left + BREADBOARD_WIDTH
    const top = b.worldY ?? 0
    const bottom = top + BREADBOARD_HEIGHT
    if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
      return b
    }
  }
  return null
}

export function useBreadboardDrag({
  svgRef,
  components,
  surfaceBoards,
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
    const {
      componentId,
      gridRow,
      gridCol,
      dragStartRow: sRow,
      dragStartCol: sCol,
      currentX,
      currentY,
    } = snap.context

    if (componentId) {
      const comp = components[componentId]
      // Look up which surface board (if any) the cursor was over at release.
      // This drives both same-board moves (recomputing grid against the
      // board's local origin) and cross-board re-parenting (Q13 b).
      const overBoard = boardAtPoint(currentX, currentY, surfaceBoards)
      const currentParentId = comp?.parentId ?? null

      if (overBoard) {
        const localX = currentX - (overBoard.worldX ?? 0)
        const localY = currentY - (overBoard.worldY ?? 0)
        const localGrid = pixelToGrid(localX, localY)
        if (overBoard.id !== currentParentId) {
          // Cross-board re-parent: update parentId and snap to the new
          // parent's local grid cell in one transaction.
          send({
            type: "UPDATE_COMPONENT",
            id: componentId,
            changes: {
              parentId: overBoard.id,
              x: localGrid.col,
              y: localGrid.row,
            },
          })
        } else if (localGrid.row !== sRow || localGrid.col !== sCol) {
          // Same-board move — use the parent-local grid so the result is
          // correct even when the parent board isn't at the legacy origin
          // (worldX/worldY != 0).
          send({
            type: "MOVE_COMPONENT",
            id: componentId,
            x: localGrid.col,
            y: localGrid.row,
          })
        }
      } else if (
        gridRow != null &&
        gridCol != null &&
        (gridRow !== sRow || gridCol !== sCol) &&
        currentParentId === null
      ) {
        // Free-space component (no parent) moved to a different cell. Q3
        // (c) forbids free-space placement for the multi-board feature,
        // so this branch only fires for legacy single-board scenes where
        // the implicit breadboard isn't an explicit component.
        send({ type: "MOVE_COMPONENT", id: componentId, x: gridCol, y: gridRow })
      }
      // Otherwise: cursor over empty world AND component has a parent —
      // no move, the component stays attached to its parent.
    }
    breadboardInteractionActor.send({ type: "POINTER_UP" })
  }, [components, surfaceBoards, send])

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

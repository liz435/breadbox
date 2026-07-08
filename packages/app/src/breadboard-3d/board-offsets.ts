// ── Multi-board world offsets ───────────────────────────────────────────────
//
// The 2D canvas places every surface board (breadboard / perfboard) at its own
// (worldX, worldY) pixel offset, and everything on a board inherits that
// offset: a part follows its `parentId` board, and a wire endpoint follows the
// board named by `from/toBoardId`. The 3D scene reuses the same pixel→world
// mapping (layout.ts), so it must apply the same offsets — otherwise a second
// or a moved board, and all the parts and wires on it, collapse onto the first
// board's position (the "only one breadboard renders in 3D" bug).
//
// These helpers mirror the 2D resolution verbatim:
//   - breadboard-canvas.tsx `parentOffsets`  → partBoardOffset
//   - wire-renderer.tsx      `offsetForBoard` → wireEndpointOffset

import type { BoardComponent } from "@dreamer/schemas"
import { pxToMm, type WorldPoint } from "./layout"

/** A board's (worldX, worldY) pixel offset — {0,0} for a board at the origin. */
export type BoardOffsetPx = { dx: number; dy: number }

const ZERO: BoardOffsetPx = { dx: 0, dy: 0 }

/** The surface boards (breadboard_full / perfboard_generic) among components. */
export function surfaceBoardsOf(
  components: Record<string, BoardComponent>,
): BoardComponent[] {
  return Object.values(components).filter(
    (c) => c.type === "breadboard_full" || c.type === "perfboard_generic",
  )
}

/** A board's own world offset (its worldX/worldY). */
export function boardOffset(board: BoardComponent): BoardOffsetPx {
  return { dx: board.worldX ?? 0, dy: board.worldY ?? 0 }
}

/** Pixel offset for a placed part: its `parentId` board, or — for legacy parts
 *  with no parentId — the sole board when exactly one exists. Mirrors the 2D
 *  canvas `parentOffsets`. */
export function partBoardOffset(
  component: BoardComponent,
  surfaceBoards: BoardComponent[],
): BoardOffsetPx {
  const soleBoardId = surfaceBoards.length === 1 ? surfaceBoards[0].id : null
  const parentId = component.parentId ?? soleBoardId
  if (!parentId) return ZERO
  const parent = surfaceBoards.find((b) => b.id === parentId)
  return parent ? boardOffset(parent) : ZERO
}

/** Pixel offset for a wire endpoint referencing `boardId`, or the sole board
 *  for legacy board-less endpoints. Mirrors wire-renderer `offsetForBoard`.
 *  (Arduino-pin endpoints resolve before this and never get a board offset.) */
export function wireEndpointOffset(
  boardId: string | undefined,
  surfaceBoards: BoardComponent[],
): BoardOffsetPx {
  if (surfaceBoards.length === 0) return ZERO
  if (boardId) {
    const board = surfaceBoards.find((b) => b.id === boardId)
    return board ? boardOffset(board) : ZERO
  }
  if (surfaceBoards.length === 1) return boardOffset(surfaceBoards[0])
  return ZERO
}

/** Convert a pixel board offset to a world-mm (x, z) translation. */
export function offsetToWorld(offset: BoardOffsetPx): WorldPoint {
  return { x: pxToMm(offset.dx), z: pxToMm(offset.dy) }
}

// ── 2D canvas space → 3D world space ────────────────────────────────────────
//
// The 2D breadboard canvas is a fixed pixel layout (Arduino board on the left,
// breadboard on the right; see breadboard-grid.ts). The 3D scene reuses that
// layout verbatim so parts appear exactly where the 2D view puts them, but in
// real-world millimeters: a breadboard hole pitch is 2.54 mm, which the 2D
// canvas draws as HOLE_SPACING px. World axes: x → right (canvas x), z → toward
// the viewer (canvas y), y → up out of the board plane.

import {
  gridToPixel,
  type GridPoint,
  BREADBOARD_OFFSET_X,
  BREADBOARD_WIDTH,
  BREADBOARD_HEIGHT,
} from "@/breadboard/breadboard-grid"
import {
  HOLE_SPACING,
  ARDUINO_BOARD_WIDTH,
  ARDUINO_BOARD_HEIGHT,
} from "@/breadboard/breadboard-constants"

/** Real hole pitch (mm) over drawn hole pitch (px). */
export const MM_PER_PX = 2.54 / HOLE_SPACING

/** Physical thicknesses of the two board surfaces (mm). */
export const PCB_THICKNESS_MM = 1.6
export const BREADBOARD_THICKNESS_MM = 8.5

/** Height of the breadboard's top face — where placed parts sit. */
export const BOARD_SURFACE_Y = BREADBOARD_THICKNESS_MM

/** Pixel rect of the Arduino board in the 2D canvas (see breadboard-grid.ts). */
export const ARDUINO_RECT_PX = {
  x: 10,
  y: 20,
  width: ARDUINO_BOARD_WIDTH,
  height: ARDUINO_BOARD_HEIGHT,
}

/** Pixel rect of the breadboard in the 2D canvas. */
export const BREADBOARD_RECT_PX = {
  x: BREADBOARD_OFFSET_X,
  y: 0,
  width: BREADBOARD_WIDTH,
  height: BREADBOARD_HEIGHT,
}

// The world origin sits at the breadboard's center so the camera orbits the
// action; the Arduino board hangs off to the -x side.
const CENTER_PX = {
  x: BREADBOARD_RECT_PX.x + BREADBOARD_RECT_PX.width / 2,
  y: BREADBOARD_RECT_PX.y + BREADBOARD_RECT_PX.height / 2,
}

export type WorldPoint = { x: number; z: number }

/** Map a 2D canvas pixel position to world mm on the board plane (y = 0). */
export function pixelToWorld(px: number, py: number): WorldPoint {
  return {
    x: (px - CENTER_PX.x) * MM_PER_PX,
    z: (py - CENTER_PX.y) * MM_PER_PX,
  }
}

/** Map a breadboard grid point to world mm on the board plane. */
export function gridPointToWorld(point: GridPoint): WorldPoint {
  const { x, y } = gridToPixel(point)
  return pixelToWorld(x, y)
}

/** Convert a pixel length (2D canvas units) to world mm. */
export function pxToMm(px: number): number {
  return px * MM_PER_PX
}

// ── Ray-Casting Engine ────────────────────────────────────────────────────
//
// 2D ray-segment intersection for the ultrasonic sensor simulation.
// Converts the environment layer (obstacles + boundary) into line segments,
// then casts a ray from the sensor's position in its facing direction.

import type { BoardComponent, Environment } from "@dreamer/schemas"
import { gridToPixel } from "@/breadboard/breadboard-grid"
import {
  HOLE_SPACING,
  ROWS,
  BOARD_PADDING,
  RAIL_OFFSET,
} from "@/breadboard/breadboard-constants"

// ── Types ────────────────────────────────────────────────────────────────

export type Ray = {
  /** Origin x */
  ox: number
  /** Origin y */
  oy: number
  /** Direction x (unit vector component) */
  dx: number
  /** Direction y (unit vector component) */
  dy: number
}

export type Segment = {
  x1: number
  y1: number
  x2: number
  y2: number
}

// ── Pixel ↔ cm conversion ────────────────────────────────────────────────
//
// One breadboard hole spacing (14 px) ≈ 2.54 mm (0.1″ standard pitch).
// Scale: 14 px = 0.254 cm → 1 px ≈ 0.01814 cm.
// For a more usable simulation range we use a looser mapping:
// 1 px = 0.5 cm gives a 400 cm max range ≈ 800 px, roughly the canvas width.

const PX_PER_CM = 2

/** Convert pixel distance to centimeters. */
export function pixelsToCm(px: number): number {
  return px / PX_PER_CM
}

// ── Ray-segment intersection ─────────────────────────────────────────────

/**
 * Compute the intersection distance (in pixels) from the ray origin to the
 * nearest segment hit. Returns `Infinity` if no segment is hit.
 *
 * Uses the parametric form of line-line intersection:
 *   Ray:     P = O + t·D     (t ≥ 0)
 *   Segment: Q = A + u·(B-A) (0 ≤ u ≤ 1)
 */
export function raycastDistance(ray: Ray, segments: Segment[]): number {
  let minDist = Infinity

  for (const seg of segments) {
    const sx = seg.x2 - seg.x1
    const sy = seg.y2 - seg.y1

    const denom = ray.dx * sy - ray.dy * sx
    if (Math.abs(denom) < 1e-10) continue // parallel

    const ox = seg.x1 - ray.ox
    const oy = seg.y1 - ray.oy

    const t = (ox * sy - oy * sx) / denom
    const u = (ox * ray.dy - oy * ray.dx) / denom

    if (t >= 0 && u >= 0 && u <= 1) {
      if (t < minDist) minDist = t
    }
  }

  return minDist
}

// ── Environment → segments ───────────────────────────────────────────────

/**
 * Expand obstacles and optional boundary into a flat array of line segments
 * that the ray-caster can test against.
 */
export function environmentToSegments(
  env: Environment,
  canvasWidth: number,
  canvasHeight: number,
): Segment[] {
  const segs: Segment[] = []

  // User-placed obstacles
  for (const obs of Object.values(env.obstacles)) {
    if (obs.shape === "wall") {
      segs.push({ x1: obs.x1, y1: obs.y1, x2: obs.x2, y2: obs.y2 })
    } else {
      // box → 4 edge segments
      segs.push(
        { x1: obs.x1, y1: obs.y1, x2: obs.x2, y2: obs.y1 }, // top
        { x1: obs.x2, y1: obs.y1, x2: obs.x2, y2: obs.y2 }, // right
        { x1: obs.x2, y1: obs.y2, x2: obs.x1, y2: obs.y2 }, // bottom
        { x1: obs.x1, y1: obs.y2, x2: obs.x1, y2: obs.y1 }, // left
      )
    }
  }

  // Boundary walls (room edges)
  if (env.boundaryEnabled) {
    const m = env.boundaryMargin
    const x0 = -m
    const y0 = -m
    const x1 = canvasWidth + m
    const y1 = canvasHeight + m
    segs.push(
      { x1: x0, y1: y0, x2: x1, y2: y0 }, // top
      { x1: x1, y1: y0, x2: x1, y2: y1 }, // right
      { x1: x1, y1: y1, x2: x0, y2: y1 }, // bottom
      { x1: x0, y1: y1, x2: x0, y2: y0 }, // left
    )
  }

  return segs
}

// ── Sensor ray from component ────────────────────────────────────────────

/**
 * Compute the ray origin and direction for an ultrasonic sensor component.
 *
 * The HC-SR04 renderer draws the transducers to the LEFT of the pin column.
 * The beam faces away from the PCB body, so:
 *   rotation 0 → beam points LEFT  (dx=-1, dy=0)
 *   rotation 1 → beam points UP    (dx=0, dy=-1)
 *   rotation 2 → beam points RIGHT (dx=1, dy=0)
 *   rotation 3 → beam points DOWN  (dx=0, dy=1)
 */
export function sensorRay(comp: BoardComponent): Ray {
  // The sensor occupies 4 rows: VCC, Trigger, Echo, GND.
  // Ray origin is between the two transducers (rows 1 and 2 = trigger and echo).
  const p1 = gridToPixel({ row: comp.y + 1, col: comp.x })
  const p2 = gridToPixel({ row: comp.y + 2, col: comp.x })
  const ox = (p1.x + p2.x) / 2
  const oy = (p1.y + p2.y) / 2

  // The transducer body sits to the LEFT of the pins, so beam exits left.
  // Offset the origin to the face of the transducers.
  const bodyOffset = 30 // approximate distance from pin column to transducer face

  const rot = (comp.rotation ?? 0) % 4
  switch (rot) {
    case 0: return { ox: ox - bodyOffset, oy, dx: -1, dy: 0 }
    case 1: return { ox, oy: oy - bodyOffset, dx: 0, dy: -1 }
    case 2: return { ox: ox + bodyOffset, oy, dx: 1, dy: 0 }
    case 3: return { ox, oy: oy + bodyOffset, dx: 0, dy: 1 }
    default: return { ox: ox - bodyOffset, oy, dx: -1, dy: 0 }
  }
}

// ── Canvas dimensions (derived from breadboard constants) ────────────────

/** Approximate canvas width in pixels for boundary calculations. */
export const CANVAS_WIDTH =
  BOARD_PADDING * 2 + RAIL_OFFSET * 2 + 9 * HOLE_SPACING + 28 // GAP_WIDTH

/** Approximate canvas height in pixels for boundary calculations. */
export const CANVAS_HEIGHT =
  BOARD_PADDING * 2 + (ROWS - 1) * HOLE_SPACING + 60 // power rail heights

// ── Part obstacles (for wire routing) ───────────────────────────────────────
//
// Approximate bounding volumes for placed parts, so the 3D wires can arc over
// what sits between their endpoints instead of spearing through it. Heights
// are rough datasheet-ish maxima (mm) that match the hero models in
// part-models.tsx; anything unlisted gets a nominal box height.

import type { BoardComponent } from "@dreamer/schemas"
import { isBoardComponentType } from "@dreamer/schemas"
import { getComponentFootprint, gridToPixel } from "@/breadboard/breadboard-grid"
import { BOARD_SURFACE_Y, pixelToWorld, pxToMm } from "./layout"

/** Approximate part height above the board surface (mm), by component type. */
const PART_HEIGHTS_MM: Record<string, number> = {
  led: 7,
  rgb_led: 7,
  servo: 24,
  dc_motor: 20,
  ultrasonic_sensor: 20,
  neopixel: 3,
  button: 5,
  buzzer: 8,
  resistor: 3,
  capacitor: 6,
  ic: 3,
  shift_register: 3,
  transistor: 8,
  temperature_sensor: 8,
  ir_receiver: 8,
  mosfet: 15,
  potentiometer: 12,
  lcd_16x2: 8,
  oled_display: 5,
  seven_segment: 6,
  relay: 16,
  pir_sensor: 12,
  dht_sensor: 12,
  photoresistor: 5,
  inductor: 6,
}

const NOMINAL_HEIGHT_MM = 6

export function partHeightMm(type: string): number {
  return PART_HEIGHTS_MM[type] ?? NOMINAL_HEIGHT_MM
}

/** A part's footprint as a world-space disc plus a top height. */
export type PartObstacle = { x: number; z: number; radius: number; topY: number }

/** Build obstacle discs for every placed non-board component. */
export function partObstacles(components: Record<string, BoardComponent>): PartObstacle[] {
  const obstacles: PartObstacle[] = []
  for (const component of Object.values(components)) {
    if (isBoardComponentType(component.type) || component.type === "wire") continue
    const fp = getComponentFootprint(
      component.type,
      component.y,
      component.x,
      component.rotation,
      component.properties,
    )
    if (fp.points.length === 0) continue

    let sx = 0
    let sz = 0
    const worldPoints = fp.points.map((point) => {
      const px = gridToPixel(point)
      const world = pixelToWorld(px.x, px.y)
      sx += world.x
      sz += world.z
      return world
    })
    const cx = sx / worldPoints.length
    const cz = sz / worldPoints.length
    // Radius = the part's footprint reach from its centroid, plus half a hole
    // so the disc covers the drawn body, not just the pin centers.
    let radius = pxToMm(7)
    for (const world of worldPoints) {
      radius = Math.max(radius, Math.hypot(world.x - cx, world.z - cz))
    }
    obstacles.push({
      x: cx,
      z: cz,
      radius: radius + pxToMm(7),
      topY: BOARD_SURFACE_Y + partHeightMm(component.type),
    })
  }
  return obstacles
}

/** Shortest distance from point (px,pz) to the segment (ax,az)–(bx,bz), in xz. */
export function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const lenSq = dx * dx + dz * dz
  if (lenSq === 0) return Math.hypot(px - ax, pz - az)
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

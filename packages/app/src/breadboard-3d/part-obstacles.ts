// ── Part obstacles (for wire routing) ───────────────────────────────────────
//
// Approximate bounding volumes for placed parts, so the 3D wires can arc over
// what sits between their endpoints instead of spearing through it. Heights
// are rough datasheet-ish maxima (mm) that match the hero models in
// part-models.tsx; anything unlisted gets a nominal box height.

import type { BoardComponent } from "@dreamer/schemas"
import { isBoardComponentType } from "@dreamer/schemas"
import { getComponentFootprint, gridToPixel } from "@/breadboard/breadboard-grid"
import { offsetToWorld, partBoardOffset, surfaceBoardsOf } from "./board-offsets"
import { BOARD_SURFACE_Y, pixelToWorld, pxToMm } from "./layout"
import { buildPartObb, getNormBounds, type Obb2 } from "./part-volume"
import type { P2 } from "./similarity-2d"

/** Per-type captured pin calibrations, passed through so the OBB tracks whatever
 *  the calibration does. Kept structural to avoid coupling to the store module. */
export type PinCalibrationLookup = Record<string, { pins: P2[]; gaps?: number[] } | undefined>

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
  power_supply: 12,
}

const NOMINAL_HEIGHT_MM = 6

export function partHeightMm(type: string): number {
  return PART_HEIGHTS_MM[type] ?? NOMINAL_HEIGHT_MM
}

/** The pin region every obstacle carries: its footprint centre `(x,z)` and
 *  `coreRadius` (the pin spread). A wire endpoint within it plugs into the part,
 *  so the part is that wire's destination — not something to arc over there. */
type PlugRegion = {
  x: number
  z: number
  coreRadius: number
}

/** A placed part as a wire obstacle. Simple parts (body sits over their pins) use
 *  a `disc`; GLB parts whose real body is a large, possibly offset box (LCD, OLED)
 *  use an `obb` derived from the calibrated model bounds (see part-volume.ts).
 *  - disc.`radius` covers the drawn body ("does a wire pass over it").
 *  - obb.`obb` is the oriented body box; clearance is checked along the segment's
 *    overlap with it, so an offset display is arced over even when the wire plugs
 *    into the same part's header. */
export type PartObstacle =
  | (PlugRegion & { kind: "disc"; radius: number; topY: number })
  | (PlugRegion & { kind: "obb"; obb: Obb2 })

/** Build obstacle discs for every placed non-board component. Each disc is
 *  shifted onto the part's parent board, so a wire clears parts on a second or
 *  moved breadboard at their real position (mirrors the part/wire offsets). */
export function partObstacles(
  components: Record<string, BoardComponent>,
  pinCals: PinCalibrationLookup = {},
): PartObstacle[] {
  const surfaceBoards = surfaceBoardsOf(components)
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
    // Reach = the part's footprint span from its centroid (the pin spread). The
    // obstacle disc pads it by half a hole so it covers the drawn body, not just
    // the pin centers; the un-padded reach is kept as coreRadius so wires can
    // recognise a hole that belongs to this part. Computed on the un-shifted
    // centroid — the board shift is a uniform translation, so it moves the disc
    // without changing its size.
    let reach = pxToMm(7)
    for (const world of worldPoints) {
      reach = Math.max(reach, Math.hypot(world.x - cx, world.z - cz))
    }
    // Shift the disc onto the part's parent board (matches the part/wire world
    // offset); coreRadius/radius are size-only and stay board-relative.
    const boardShift = offsetToWorld(partBoardOffset(component, surfaceBoards))
    const plug: PlugRegion = {
      x: cx + boardShift.x,
      z: cz + boardShift.z,
      coreRadius: reach,
    }

    // A GLB part whose body extents are known → oriented box built from the
    // calibrated model bounds (accurate for large/offset panel modules). Until a
    // type's GLB has rendered once (no bounds yet), fall back to the pin disc.
    const bounds = getNormBounds(component.type)
    if (bounds) {
      obstacles.push({
        kind: "obb",
        ...plug,
        obb: buildPartObb(component, bounds, pinCals[component.type], boardShift),
      })
    } else {
      obstacles.push({
        kind: "disc",
        ...plug,
        radius: reach + pxToMm(7),
        topY: BOARD_SURFACE_Y + partHeightMm(component.type),
      })
    }
  }
  return obstacles
}

/** Closest approach of point (px,pz) to segment (ax,az)–(bx,bz), in xz: both the
 *  distance and the clamped projection parameter t∈[0,1] along the segment. */
export function segmentClosest(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { distance: number; t: number } {
  const dx = bx - ax
  const dz = bz - az
  const lenSq = dx * dx + dz * dz
  if (lenSq === 0) return { distance: Math.hypot(px - ax, pz - az), t: 0 }
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq
  t = Math.max(0, Math.min(1, t))
  return { distance: Math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t }
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
  return segmentClosest(px, pz, ax, az, bx, bz).distance
}

// ── Wire endpoint clearance (3D) ────────────────────────────────────────────
//
// Stored wires often terminate on the exact hole a part's pin occupies (the 2D
// canvas and the agent both wire straight to the pin). Electrically that's the
// point — a breadboard strip is one net — but rendered in 3D it puts a jumper
// pin and a component leg in the same hole, so the wire spears through the
// part's body (the buzzer was the canonical offender).
//
// This module slides such endpoints along their own strip — the same 5-hole
// terminal row half, or the same rail column — to a free hole clear of every
// part body. Same net, so nothing electrical changes; it is purely how the 3D
// scene chooses which physical hole of the strip to plug into, the way a
// person wires a real board. Stored wire data is never touched, so existing
// projects and examples all benefit.

import type { BoardComponent, Wire } from "@dreamer/schemas"
import { isBoardComponentType } from "@dreamer/schemas"
import { getComponentFootprint, gridToPixel, railRows } from "@/breadboard/breadboard-grid"
import { offsetToWorld, partBoardOffset, surfaceBoardsOf, wireEndpointOffset } from "./board-offsets"
import { pixelToWorld, pxToMm } from "./layout"

/** Two endpoints closer than this (mm, in the board plane) share a hole. */
const SAME_HOLE_MM = 0.8
/** Gap wanted between a wire's entry hole and the nearest part body edge (mm). */
const BODY_CLEARANCE_MM = 1.2
/** How far along a rail a displaced endpoint may wander (rows). */
const MAX_RAIL_SHIFT_ROWS = 10
/** Parts whose pin spread exceeds this aren't body-checked: a disc centred on
 *  the pins of a board-wide module (PSU, LCD header) would swallow half the
 *  board and displace every wire. Their pin holes still count as taken. */
const WIDE_PART_REACH_MM = 8
/** 3D body radii (mm) for parts whose real model is much fatter than their pin
 *  spread — the pin-derived disc under-covers them (a buzzer's two pins sit at
 *  its centre, but its can is ~13 mm across). */
const MIN_BODY_RADIUS_MM: Record<string, number> = {
  buzzer: 7,
  potentiometer: 6,
  servo: 8,
  temperature_sensor: 4,
  transistor: 4,
}

type Xz = { x: number; z: number }

type PartBody = {
  centroid: Xz
  /** Pin spread plus the same half-hole pad part-obstacles uses for the drawn
   *  body (or the type's known 3D radius when larger). 0 for wide modules —
   *  pin-hole conflicts only. */
  bodyRadius: number
  pins: Xz[]
}

function holeWorld(row: number, col: number, offset: Xz): Xz {
  const px = gridToPixel({ row, col })
  const world = pixelToWorld(px.x, px.y)
  return { x: world.x + offset.x, z: world.z + offset.z }
}

function dist(a: Xz, b: Xz): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** World-space body discs + pin holes for every placed part (mirrors the
 *  footprint/reach model in part-obstacles.ts). */
function resolvePartBodies(
  components: Record<string, BoardComponent>,
  surfaceBoards: BoardComponent[],
): PartBody[] {
  const bodies: PartBody[] = []
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
    const shift = offsetToWorld(partBoardOffset(component, surfaceBoards))
    const pins = fp.points.map((point) => holeWorld(point.row, point.col, shift))
    const centroid = {
      x: pins.reduce((s, p) => s + p.x, 0) / pins.length,
      z: pins.reduce((s, p) => s + p.z, 0) / pins.length,
    }
    let reach = pxToMm(7)
    for (const pin of pins) reach = Math.max(reach, dist(pin, centroid))
    const bodyRadius =
      reach > WIDE_PART_REACH_MM
        ? 0
        : Math.max(reach + pxToMm(7), MIN_BODY_RADIUS_MM[component.type] ?? 0)
    bodies.push({ centroid, bodyRadius, pins })
  }
  return bodies
}

/** Alternative holes on the same electrical strip as (row, col), nearest
 *  first. Terminal halves share their row; rails share their column. */
function stripAlternatives(row: number, col: number): Array<{ row: number; col: number }> {
  if (col >= 0 && col <= 4) {
    return [0, 1, 2, 3, 4].filter((c) => c !== col).map((c) => ({ row, col: c }))
  }
  if (col >= 5 && col <= 9) {
    return [5, 6, 7, 8, 9].filter((c) => c !== col).map((c) => ({ row, col: c }))
  }
  if (col === -2 || col === -1 || col === 10 || col === 11) {
    return railRows()
      .filter((r) => r !== row && Math.abs(r - row) <= MAX_RAIL_SHIFT_ROWS)
      .sort((a, b) => Math.abs(a - row) - Math.abs(b - row))
      .map((r) => ({ row: r, col }))
  }
  return []
}

function clearanceOf(point: Xz, bodies: PartBody[]): number {
  let clearance = Infinity
  for (const body of bodies) {
    clearance = Math.min(clearance, dist(point, body.centroid) - body.bodyRadius)
  }
  return clearance
}

/**
 * Wires with any conflicting endpoint slid to a clear hole on the same strip.
 * Deterministic (wires processed in id order, nearest viable hole wins) so the
 * scene doesn't reshuffle between renders. Wires without conflicts are
 * returned as-is, preserving reference equality for memoized consumers.
 */
export function remapWireEndpoints(
  wires: Record<string, Wire>,
  components: Record<string, BoardComponent>,
): Record<string, Wire> {
  const surfaceBoards = surfaceBoardsOf(components)
  const bodies = resolvePartBodies(components, surfaceBoards)
  if (bodies.length === 0) return wires

  // Holes already spoken for: every part pin and every wire endpoint. Assigned
  // relocations join the list so two displaced wires never pick the same hole.
  const taken: Xz[] = bodies.flatMap((b) => b.pins)
  const endpointWorld = (wire: Wire, side: "from" | "to"): Xz | null => {
    const row = side === "from" ? wire.fromRow : wire.toRow
    const col = side === "from" ? wire.fromCol : wire.toCol
    if (row < 0) return null
    const boardId = side === "from" ? wire.fromBoardId : wire.toBoardId
    const off = offsetToWorld(wireEndpointOffset(boardId, surfaceBoards))
    return holeWorld(row, col, off)
  }
  const sorted = Object.values(wires).sort((a, b) => a.id.localeCompare(b.id))
  for (const wire of sorted) {
    for (const side of ["from", "to"] as const) {
      const p = endpointWorld(wire, side)
      if (p) taken.push(p)
    }
  }

  const out: Record<string, Wire> = {}
  let changedAny = false
  for (const wire of sorted) {
    let next = wire
    for (const side of ["from", "to"] as const) {
      const row = side === "from" ? next.fromRow : next.toRow
      const col = side === "from" ? next.fromCol : next.toCol
      if (row < 0) continue
      const boardId = side === "from" ? next.fromBoardId : next.toBoardId
      const off = offsetToWorld(wireEndpointOffset(boardId, surfaceBoards))
      const here = holeWorld(row, col, off)

      const inPinHole = bodies.some((b) => b.pins.some((pin) => dist(pin, here) < SAME_HOLE_MM))
      const underBody = clearanceOf(here, bodies) < BODY_CLEARANCE_MM
      if (!inPinHole && !underBody) continue

      const candidates = stripAlternatives(row, col)
        .map((cell) => ({ cell, world: holeWorld(cell.row, cell.col, off) }))
        .filter(({ world }) => !taken.some((t) => dist(t, world) < SAME_HOLE_MM))
      if (candidates.length === 0) continue

      // Nearest hole that fully clears every body; else the clearest one.
      const viable = candidates.find(({ world }) => clearanceOf(world, bodies) >= BODY_CLEARANCE_MM)
      const pick =
        viable ??
        candidates.reduce((best, c) =>
          clearanceOf(c.world, bodies) > clearanceOf(best.world, bodies) ? c : best,
        )

      next =
        side === "from"
          ? { ...next, fromRow: pick.cell.row, fromCol: pick.cell.col }
          : { ...next, toRow: pick.cell.row, toCol: pick.cell.col }
      taken.push(pick.world)
      changedAny = true
    }
    out[next.id] = next
  }
  return changedAny ? out : wires
}

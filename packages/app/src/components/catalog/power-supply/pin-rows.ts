import { railBlockStarts } from "@/breadboard/breadboard-grid"
import { RAIL_BLOCK_HOLES } from "@/breadboard/breadboard-constants"

/** The MB102's two pin rows sit 4 holes apart — exactly a rail block's 1st and
 *  5th holes — so the module always seats onto one whole block. Snaps the
 *  anchor row to the nearest block start, clamped to the 2nd block: the body
 *  overhangs ~7 rows past the top pin row toward the board end, so seating on
 *  the 1st block would hang it off the board. Shared by the footprint, the 2D
 *  renderer, and (via the footprint) the 3D pin fit. */
export function powerSupplyPinRows(anchorRow: number): [number, number] {
  const starts = railBlockStarts()
  const usable = starts.length > 1 ? starts.slice(1) : starts
  let best = usable[0] ?? 0
  for (const start of usable) {
    if (Math.abs(start - anchorRow) < Math.abs(best - anchorRow)) best = start
  }
  return [best, best + RAIL_BLOCK_HOLES - 1]
}

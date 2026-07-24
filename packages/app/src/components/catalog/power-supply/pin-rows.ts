import { railBlockStarts } from "@/breadboard/breadboard-grid"
import { RAIL_BLOCK_HOLES } from "@/breadboard/breadboard-constants"

/** How far the drawn PCB extends past the pin rows, in hole rows. Measured
 *  from the GLB the 3D view renders: the module body is 31.2mm along the
 *  board with its pin rows 18.7mm from the up-board edge and 2.6mm from the
 *  down-board edge — ~7.5 and ~1 hole rows. Keeping the 2D silhouette on the
 *  same numbers means both views show the module covering the same rows. The
 *  top overhang also steers the block snap below, so the body lands where
 *  the user dropped the module. */
export const PSU_BODY_OVERHANG_TOP_ROWS = 7.5
export const PSU_BODY_OVERHANG_BOTTOM_ROWS = 1

/** The MB102's two pin rows sit 4 holes apart — exactly a rail block's 1st and
 *  5th holes — so the module always seats onto one whole block. The anchor row
 *  is where the user dropped the module, i.e. where its visible TOP should sit;
 *  the pins land on whichever block puts the body top nearest that row. Clamped
 *  to the 2nd block so the body never hangs off the board end. Shared by the
 *  footprint, the 2D renderer, and (via the footprint) the 3D pin fit. */
export function powerSupplyPinRows(anchorRow: number): [number, number] {
  const starts = railBlockStarts()
  const usable = starts.length > 1 ? starts.slice(1) : starts
  const targetStart = anchorRow + PSU_BODY_OVERHANG_TOP_ROWS
  let best = usable[0] ?? 0
  for (const start of usable) {
    // `<=` breaks ties downward, keeping the body at or below the drop row.
    if (Math.abs(start - targetStart) <= Math.abs(best - targetStart)) {
      best = start
    }
  }
  return [best, best + RAIL_BLOCK_HOLES - 1]
}

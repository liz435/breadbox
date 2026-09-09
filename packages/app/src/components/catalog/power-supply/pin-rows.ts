// Compatibility seam for catalog imports. Pin snapping and body overhang are
// cross-runtime physical facts, so their implementation lives in board-domain.
export {
  powerSupplyPinRows,
  PSU_BODY_OVERHANG_BOTTOM_ROWS,
  PSU_BODY_OVERHANG_TOP_ROWS,
} from "@dreamer/board-domain"

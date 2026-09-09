// Compatibility seam for the agent tools. Physical placement belongs to the
// renderer-free board domain so browser and API consumers cannot drift.
export {
  AUTO_LAYOUT_ROW_GAP,
  advanceAutoLayoutRow,
  componentLayoutHeight,
  findAutoLayoutRow,
} from "@dreamer/board-domain"

import type {
  BoardComponent,
  Wire,
  CustomLibrary,
  BoardTarget,
  Environment,
  AssemblyDoc,
  RealismProfile,
} from "@dreamer/schemas"

/**
 * The subset of board context that round-trips through save/load.
 *
 * Must stay in sync with `boardData()` in store/board-machine.ts: anything the
 * machine snapshots for undo is user-authored state and has to persist too.
 * The only legitimate exclusions are ephemeral runtime state (see
 * `EPHEMERAL_BOARD_FIELDS`). `board-slice.test.ts` enforces this against
 * `boardStateSchema`, so a new BoardState field fails the test until someone
 * decides, explicitly, whether it persists.
 *
 * Omitting `assembly` here silently dropped every 3D assembly on reload, and
 * made the server's asset sweep treat every imported model as orphaned —
 * deleting the uploaded files after the grace window.
 */
export type BoardPersistable = {
  components: Record<string, BoardComponent>
  wires: Record<string, Wire>
  sketchCode: string
  customLibraries: Record<string, CustomLibrary>
  boardTarget?: BoardTarget
  environment: Environment
  realismProfile?: RealismProfile
  assembly?: AssemblyDoc
}

/**
 * Board fields that are deliberately NOT persisted: live runtime output, not
 * user-authored documents. Re-derived on each run.
 */
export const EPHEMERAL_BOARD_FIELDS = ["serialOutput", "libraryState"] as const

// Centralizing this prevents the dirty-check and the save payload from
// drifting apart — both must read from the same shape.
export function boardSlice(ctx: BoardPersistable): BoardPersistable {
  return {
    components: ctx.components,
    wires: ctx.wires,
    sketchCode: ctx.sketchCode,
    customLibraries: ctx.customLibraries,
    boardTarget: ctx.boardTarget,
    environment: ctx.environment,
    realismProfile: ctx.realismProfile,
    assembly: ctx.assembly,
  }
}

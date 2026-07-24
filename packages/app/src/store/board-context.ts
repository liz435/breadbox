import { createActorContext } from "@xstate/react";
import { boardMachine, type BoardEvent, type BoardMachineContext } from "./board-machine";

export const BoardContext = createActorContext(boardMachine);

/**
 * Fields `useBoard()` subscribers are re-rendered for.
 *
 * Every persisted board field must appear here. A field the machine mutates
 * but this list omits is invisible to `useBoard()`: the selector keeps handing
 * back the previous context object, so subscribers read stale values and any
 * effect keyed on them never re-runs. `assembly` and `customLibraries` were
 * both missing — 3D edits never triggered the debounced autosave, and
 * `useAssemblyActions` kept spreading a stale document.
 *
 * `_past`/`_future` are deliberately absent: undo history changes on every
 * edit and is already implied by the data fields.
 */
const OBSERVED_FIELDS = [
  "components",
  "wires",
  "libraryState",
  "serialOutput",
  "sketchCode",
  "customLibraries",
  "boardTarget",
  "environment",
  "realismProfile",
  "assembly",
  "selectedId",
  "buildLog",
] as const satisfies readonly (keyof BoardMachineContext)[];

export function boardEqual(a: BoardMachineContext, b: BoardMachineContext) {
  return OBSERVED_FIELDS.every((field) => a[field] === b[field]);
}

export function useBoard(): {
  state: BoardMachineContext;
  send: (event: BoardEvent) => void;
} {
  const actorRef = BoardContext.useActorRef();
  const state = BoardContext.useSelector((snap) => snap.context, boardEqual);
  return { state, send: actorRef.send.bind(actorRef) };
}

export function useBoardSelector<T>(
  selector: (ctx: BoardMachineContext) => T
): T {
  return BoardContext.useSelector((snap) => selector(snap.context));
}

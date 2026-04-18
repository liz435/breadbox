import { createActorContext } from "@xstate/react";
import { boardMachine, type BoardEvent, type BoardMachineContext } from "./board-machine";

export const BoardContext = createActorContext(boardMachine);

function boardEqual(a: BoardMachineContext, b: BoardMachineContext) {
  return (
    a.components === b.components &&
    a.wires === b.wires &&
    a.libraryState === b.libraryState &&
    a.serialOutput === b.serialOutput &&
    a.sketchCode === b.sketchCode &&
    a.boardTarget === b.boardTarget &&
    a.environment === b.environment &&
    a.selectedId === b.selectedId &&
    a.buildLog === b.buildLog
  );
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

export function useCanUndo(): boolean {
  return BoardContext.useSelector((snap) => snap.context._past.length > 0);
}

export function useCanRedo(): boolean {
  return BoardContext.useSelector((snap) => snap.context._future.length > 0);
}

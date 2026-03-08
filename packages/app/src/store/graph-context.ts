import { createActorContext } from "@xstate/react";
import {
  graphMachine,
  type GraphEvent,
  type GraphMachineContext,
  type GraphState,
} from "./graph-machine";

export const GraphContext = createActorContext(graphMachine);

function graphEqual(a: GraphMachineContext, b: GraphMachineContext) {
  return (
    a.nodes === b.nodes &&
    a.edges === b.edges &&
    a.selectedNodeIds === b.selectedNodeIds &&
    a.selectedEdgeIds === b.selectedEdgeIds
  );
}

export function useGraph(): {
  state: GraphState;
  send: (event: GraphEvent) => void;
} {
  const actorRef = GraphContext.useActorRef();
  const state = GraphContext.useSelector(
    (snap) => snap.context,
    graphEqual
  );
  return { state, send: actorRef.send.bind(actorRef) };
}

export function useGraphCanUndo(): boolean {
  return GraphContext.useSelector((snap) => snap.context._past.length > 0);
}

export function useGraphCanRedo(): boolean {
  return GraphContext.useSelector((snap) => snap.context._future.length > 0);
}

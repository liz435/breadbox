import { createActorContext } from "@xstate/react";
import { sceneMachine, type SceneEvent, type SceneMachineContext } from "./scene-machine";
import type { SceneState } from "../types";

export const SceneContext = createActorContext(sceneMachine);

// Only re-render when actual scene data changes, not history stacks
function sceneEqual(a: SceneMachineContext, b: SceneMachineContext) {
  return (
    a.sprites === b.sprites &&
    a.selectedId === b.selectedId &&
    a.tilemap === b.tilemap &&
    a.activeBrush === b.activeBrush
  );
}

export function useScene(): { state: SceneState; send: (event: SceneEvent) => void } {
  const actorRef = SceneContext.useActorRef();
  const state = SceneContext.useSelector((snap) => snap.context, sceneEqual);
  return { state, send: actorRef.send.bind(actorRef) };
}

export function useCanUndo(): boolean {
  return SceneContext.useSelector((snap) => snap.context._past.length > 0);
}

export function useCanRedo(): boolean {
  return SceneContext.useSelector((snap) => snap.context._future.length > 0);
}

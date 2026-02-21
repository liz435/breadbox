import type { FederatedPointerEvent } from "pixi.js";

import type { HandleId, SceneState, Sprite } from "@/types";
import type { SceneEvent } from "@/store/scene-machine";
import { interactionActor } from "@/interaction/interaction-machine";
import { pixelToTile } from "@/canvas/tile-utils";
import { screenToWorld, getCamera, setCamera, isSpaceHeld } from "@/canvas/camera";

type Send = (event: SceneEvent) => void;

export function onSpritePointerDown(
  sprite: Sprite,
  event: FederatedPointerEvent,
  send: Send
) {
  if (isSpaceHeld()) return; // Let stage handle panning
  event.stopPropagation();
  const world = screenToWorld(event.global.x, event.global.y);
  send({ type: "SNAPSHOT" });
  send({ type: "SELECT", id: sprite.id });
  interactionActor.send({
    type: "START_DRAG",
    spriteId: sprite.id,
    offsetX: world.x - sprite.x,
    offsetY: world.y - sprite.y,
  });
}

export function onHandlePointerDown(
  sprite: Sprite,
  handleId: HandleId,
  event: FederatedPointerEvent,
  send: Send
) {
  if (isSpaceHeld()) return;
  event.stopPropagation();
  send({ type: "SNAPSHOT" });
  const world = screenToWorld(event.global.x, event.global.y);

  if (handleId === "rotate") {
    interactionActor.send({
      type: "START_ROTATE",
      spriteId: sprite.id,
      pivot: { x: sprite.x, y: sprite.y },
      startAngle: Math.atan2(world.y - sprite.y, world.x - sprite.x),
      initialRotation: sprite.rotation,
    });
  } else {
    interactionActor.send({
      type: "START_RESIZE",
      spriteId: sprite.id,
      handleId,
      origin: { x: world.x, y: world.y },
      initialSprite: { ...sprite },
    });
  }
}

export function onStagePointerDown(
  event: FederatedPointerEvent,
  state: SceneState,
  send: Send
) {
  if (isSpaceHeld()) {
    const { x, y } = event.global;
    interactionActor.send({ type: "START_PAN", screenX: x, screenY: y });
    return;
  }

  const world = screenToWorld(event.global.x, event.global.y);

  // Try tile painting
  if (state.tilemap) {
    const tile = pixelToTile(world.x, world.y, state.tilemap);
    if (tile) {
      send({ type: "SNAPSHOT" });
      send({ type: "SELECT", id: null });
      send({ type: "PAINT_TILE", row: tile.row, col: tile.col, tileType: state.activeBrush });
      interactionActor.send({ type: "START_PAINT" });
      return;
    }
  }

  // Empty space — deselect
  send({ type: "SELECT", id: null });
}

export function onStagePointerMove(
  event: FederatedPointerEvent,
  state: SceneState,
  send: Send
) {
  const snapshot = interactionActor.getSnapshot();
  const mode = snapshot.value as string;
  const ctx = snapshot.context;

  switch (mode) {
    case "panning": {
      const screenX = event.global.x;
      const screenY = event.global.y;
      const dx = screenX - ctx.lastScreenX;
      const dy = screenY - ctx.lastScreenY;
      const cam = getCamera();
      setCamera({ offsetX: cam.offsetX + dx, offsetY: cam.offsetY + dy, zoom: cam.zoom });
      interactionActor.send({ type: "UPDATE_PAN", screenX, screenY });
      return;
    }
    case "painting": {
      if (state.tilemap) {
        const world = screenToWorld(event.global.x, event.global.y);
        const tile = pixelToTile(world.x, world.y, state.tilemap);
        if (tile) {
          send({ type: "PAINT_TILE", row: tile.row, col: tile.col, tileType: state.activeBrush });
        }
      }
      return;
    }
    case "dragging": {
      if (ctx.spriteId) {
        const world = screenToWorld(event.global.x, event.global.y);
        send({
          type: "UPDATE",
          id: ctx.spriteId,
          changes: { x: world.x - ctx.offsetX, y: world.y - ctx.offsetY },
        });
      }
      break;
    }
    case "rotating": {
      if (ctx.spriteId && ctx.pivot) {
        const world = screenToWorld(event.global.x, event.global.y);
        const angle = Math.atan2(world.y - ctx.pivot.y, world.x - ctx.pivot.x);
        const delta = angle - ctx.startAngle;
        send({
          type: "UPDATE",
          id: ctx.spriteId,
          changes: { rotation: ctx.initialRotation + delta },
        });
      }
      break;
    }
    case "resizing": {
      if (ctx.spriteId && ctx.handleId && ctx.origin && ctx.initialSprite) {
        const world = screenToWorld(event.global.x, event.global.y);
        handleResize(ctx.spriteId, ctx.handleId, world.x, world.y, ctx.origin, ctx.initialSprite, event.shiftKey, send);
      }
      break;
    }
  }
}

export function onStagePointerUp() {
  interactionActor.send({ type: "RELEASE" });
}

function handleResize(
  spriteId: string,
  handleId: HandleId,
  mx: number,
  my: number,
  origin: { x: number; y: number },
  initial: Sprite,
  freeform: boolean,
  send: Send
) {
  const dx = mx - origin.x;
  const dy = my - origin.y;

  const cos = Math.cos(-initial.rotation);
  const sin = Math.sin(-initial.rotation);
  const ldx = dx * cos - dy * sin;
  const ldy = dx * sin + dy * cos;

  const iw = initial.width * Math.abs(initial.scaleX);
  const ih = initial.height * Math.abs(initial.scaleY);

  let newW = iw;
  let newH = ih;

  const isCorner = handleId === "tl" || handleId === "tr" || handleId === "bl" || handleId === "br";
  const isLeft = handleId === "tl" || handleId === "bl" || handleId === "l";
  const isRight = handleId === "tr" || handleId === "br" || handleId === "r";
  const isTop = handleId === "tl" || handleId === "tr" || handleId === "t";
  const isBottom = handleId === "bl" || handleId === "br" || handleId === "b";

  if (isRight) newW = Math.max(20, iw + ldx * 2);
  if (isLeft) newW = Math.max(20, iw - ldx * 2);
  if (isBottom) newH = Math.max(20, ih + ldy * 2);
  if (isTop) newH = Math.max(20, ih - ldy * 2);

  if (!freeform && isCorner) {
    const aspect = iw / ih;
    const scaleW = newW / iw;
    const scaleH = newH / ih;
    if (Math.abs(scaleW - 1) > Math.abs(scaleH - 1)) {
      newH = newW / aspect;
    } else {
      newW = newH * aspect;
    }
  }

  const newScaleX = (newW / initial.width) * Math.sign(initial.scaleX || 1);
  const newScaleY = (newH / initial.height) * Math.sign(initial.scaleY || 1);

  send({
    type: "UPDATE",
    id: spriteId,
    changes: { scaleX: newScaleX, scaleY: newScaleY },
  });
}

import type { GraphNode, Edge } from "@dreamer/schemas";
import type { GraphEvent } from "./graph-machine";
import type { SceneEvent } from "./scene-machine";
import type { BoardEvent } from "./board-machine";
import type { Sprite } from "../types";
import { generateArduinoCode } from "../graph/arduino-codegen";

/**
 * Bridge between graph and scene state machines.
 *
 * When a sprite-type graph node is created/deleted, the bridge
 * generates corresponding scene events to keep the PixiJS canvas in sync.
 *
 * Graph node positions are independent from sprite scene positions —
 * graph layout is for the node editor, sprite transform is for the canvas.
 */

const DEFAULT_SPRITE_SIZE = 64;

/**
 * Generate a solid-color placeholder image for a sprite.
 */
function generatePlaceholderImage(
  color: string,
  width: number,
  height: number
): Promise<HTMLImageElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL();
  });
}

/**
 * When a graph event occurs, check if it should also produce
 * a scene event (for sprite nodes that need canvas representation).
 *
 * Returns null if no scene event is needed.
 */
export async function graphEventToSceneEvents(
  event: GraphEvent
): Promise<SceneEvent[] | null> {
  switch (event.type) {
    case "ADD_NODE": {
      // TODO: Implement Arduino-specific bridge logic if needed
      return null;
    }

    case "REMOVE_NODE": {
      // We always dispatch REMOVE — if the id doesn't match a sprite,
      // the scene machine simply ignores it (no sprite with that id).
      return [{ type: "REMOVE", id: event.nodeId }];
    }

    case "UPDATE_NODE": {
      // If the node data patch includes sprite-relevant fields, forward them
      const changes: Partial<Omit<Sprite, "id" | "image">> = {};
      const patch = event.patch;
      if (typeof patch.name === "string") changes.name = patch.name;
      if (typeof patch.sceneX === "number") changes.x = patch.sceneX;
      if (typeof patch.sceneY === "number") changes.y = patch.sceneY;
      if (typeof patch.width === "number") changes.width = patch.width;
      if (typeof patch.height === "number") changes.height = patch.height;
      if (typeof patch.rotation === "number") changes.rotation = patch.rotation;
      if (typeof patch.scaleX === "number") changes.scaleX = patch.scaleX;
      if (typeof patch.scaleY === "number") changes.scaleY = patch.scaleY;

      if (Object.keys(changes).length === 0) return null;
      return [{ type: "UPDATE", id: event.nodeId, changes }];
    }

    default:
      return null;
  }
}

/**
 * Regenerate Arduino sketch code from the current graph state and
 * dispatch UPDATE_SKETCH to the board machine to keep them in sync.
 */
export function syncCodegenToBoard(
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>,
  boardSend: (event: BoardEvent) => void,
): void {
  const code = generateArduinoCode(nodes, edges);
  boardSend({ type: "UPDATE_SKETCH", code });
}

async function graphNodeToSprite(node: GraphNode): Promise<Sprite> {
  const tint =
    typeof node.data.tint === "string" ? node.data.tint : "#4a9eff";
  const width =
    typeof node.data.width === "number"
      ? node.data.width
      : DEFAULT_SPRITE_SIZE;
  const height =
    typeof node.data.height === "number"
      ? node.data.height
      : DEFAULT_SPRITE_SIZE;
  const image = await generatePlaceholderImage(tint, width, height);

  return {
    id: node.id,
    name: node.name,
    image,
    x: typeof node.data.sceneX === "number" ? node.data.sceneX : 400,
    y: typeof node.data.sceneY === "number" ? node.data.sceneY : 300,
    width,
    height,
    rotation:
      typeof node.data.rotation === "number" ? node.data.rotation : 0,
    scaleX: typeof node.data.scaleX === "number" ? node.data.scaleX : 1,
    scaleY: typeof node.data.scaleY === "number" ? node.data.scaleY : 1,
  };
}

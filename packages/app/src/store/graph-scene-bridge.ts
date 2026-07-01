import type { GraphNode, Edge } from "@dreamer/schemas";
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

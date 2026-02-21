export interface Sprite {
  id: string;
  name: string;
  image: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

// ── Tile types ──

export interface TileTypeDef {
  id: number;
  name: string;
  color: string;
}

export const TILE_TYPES: TileTypeDef[] = [
  { id: 0, name: "Grass", color: "#4a7c59" },
  { id: 1, name: "Dirt", color: "#8b6914" },
  { id: 2, name: "Water", color: "#2980b9" },
  { id: 3, name: "Stone", color: "#7f8c8d" },
  { id: -1, name: "Wall", color: "#2c3e50" },
];

export const TILE_FALLBACK_COLOR = "#333333";

export interface TilemapData {
  width: number;
  height: number;
  tileSize: number;
  tiles: number[][];
}

// ── Scene state ──

export interface SceneState {
  sprites: Sprite[];
  selectedId: string | null;
  tilemap: TilemapData | null;
  activeBrush: number;
}

export type HandleId = "tl" | "tr" | "bl" | "br" | "t" | "r" | "b" | "l" | "rotate";

export type InteractionMode =
  | { type: "idle" }
  | { type: "dragging"; spriteId: string; offsetX: number; offsetY: number }
  | {
      type: "resizing";
      spriteId: string;
      handleId: HandleId;
      origin: { x: number; y: number };
      initialSprite: Sprite;
    }
  | {
      type: "rotating";
      spriteId: string;
      pivot: { x: number; y: number };
      startAngle: number;
      initialRotation: number;
    }
  | { type: "painting" }
  | { type: "panning"; lastScreenX: number; lastScreenY: number };

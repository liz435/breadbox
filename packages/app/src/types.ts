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

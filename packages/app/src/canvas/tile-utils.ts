import type { TilemapData } from "../types";

export function pixelToTile(
  px: number,
  py: number,
  tilemap: TilemapData
): { row: number; col: number } | null {
  const col = Math.floor(px / tilemap.tileSize);
  const row = Math.floor(py / tilemap.tileSize);
  if (row < 0 || row >= tilemap.height || col < 0 || col >= tilemap.width) {
    return null;
  }
  return { row, col };
}

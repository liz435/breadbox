import type { Sprite, HandleId } from "@/types";
import { rotatePoint } from "@/utils/math";

export type Handle = {
  id: HandleId;
  x: number;
  y: number;
};

export const ROTATE_HANDLE_OFFSET = 30;

export function computeHandles(sprite: Sprite): Handle[] {
  const hw = (sprite.width * Math.abs(sprite.scaleX)) / 2;
  const hh = (sprite.height * Math.abs(sprite.scaleY)) / 2;

  // Local-space positions relative to sprite center
  const localHandles: { id: HandleId; lx: number; ly: number }[] = [
    { id: "tl", lx: -hw, ly: -hh },
    { id: "tr", lx: hw, ly: -hh },
    { id: "bl", lx: -hw, ly: hh },
    { id: "br", lx: hw, ly: hh },
    { id: "t", lx: 0, ly: -hh },
    { id: "r", lx: hw, ly: 0 },
    { id: "b", lx: 0, ly: hh },
    { id: "l", lx: -hw, ly: 0 },
    { id: "rotate", lx: 0, ly: -hh - ROTATE_HANDLE_OFFSET },
  ];

  return localHandles.map(({ id, lx, ly }) => {
    const world = rotatePoint(
      sprite.x + lx,
      sprite.y + ly,
      sprite.x,
      sprite.y,
      sprite.rotation
    );
    return { id, x: world.x, y: world.y };
  });
}

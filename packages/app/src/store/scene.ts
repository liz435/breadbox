import type { Sprite } from "../types";

// ── Helper to build a sprite ──

let nextId = 1;

export function createSprite(image: HTMLImageElement, name: string): Sprite {
  const id = `sprite-${nextId++}`;
  let w = image.naturalWidth;
  let h = image.naturalHeight;
  const maxDim = 200;
  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  return {
    id,
    name,
    image,
    x: 400,
    y: 300,
    width: w,
    height: h,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };
}

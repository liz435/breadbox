export function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angle: number
): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

export function inverseRotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angle: number
): { x: number; y: number } {
  return rotatePoint(px, py, cx, cy, -angle);
}

export function distance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

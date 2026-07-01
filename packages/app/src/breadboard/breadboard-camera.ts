import { clamp } from "@/utils/math";

export type CameraState = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;

let state: CameraState = { offsetX: 0, offsetY: 0, zoom: 1 };

export function getCamera(): Readonly<CameraState> {
  return state;
}

export function setCamera(next: Partial<CameraState>): void {
  state = {
    offsetX: next.offsetX ?? state.offsetX,
    offsetY: next.offsetY ?? state.offsetY,
    zoom: clamp(next.zoom ?? state.zoom, MIN_ZOOM, MAX_ZOOM),
  };
}

export function screenToBoard(
  sx: number,
  sy: number
): { x: number; y: number } {
  return {
    x: (sx - state.offsetX) / state.zoom,
    y: (sy - state.offsetY) / state.zoom,
  };
}

/**
 * Frame a board-space rectangle: choose zoom + offset so the bbox occupies
 * most of the viewport with `padding` (board-space units) on every side.
 * Used by "fit to all boards" / home key.
 */
export function fitBbox(
  bbox: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  padding: number = 80,
): void {
  if (bbox.width <= 0 || bbox.height <= 0) return;
  if (viewport.width <= 0 || viewport.height <= 0) return;
  const targetW = viewport.width;
  const targetH = viewport.height;
  const fitZoom = clamp(
    Math.min(
      targetW / (bbox.width + padding * 2),
      targetH / (bbox.height + padding * 2),
    ),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  // Center the bbox in the viewport.
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  state = {
    zoom: fitZoom,
    offsetX: targetW / 2 - cx * fitZoom,
    offsetY: targetH / 2 - cy * fitZoom,
  };
}

export function zoomAtPoint(
  screenX: number,
  screenY: number,
  newZoom: number
): void {
  const clamped = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  const bx = (screenX - state.offsetX) / state.zoom;
  const by = (screenY - state.offsetY) / state.zoom;
  state = {
    offsetX: screenX - bx * clamped,
    offsetY: screenY - by * clamped,
    zoom: clamped,
  };
}

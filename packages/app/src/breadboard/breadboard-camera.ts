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

export function resetCamera(): void {
  state = { offsetX: 0, offsetY: 0, zoom: 1 };
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

export function boardToScreen(
  bx: number,
  by: number
): { x: number; y: number } {
  return {
    x: bx * state.zoom + state.offsetX,
    y: by * state.zoom + state.offsetY,
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

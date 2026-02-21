import { clamp } from "../utils/math";

export type Camera = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

let camera: Camera = { offsetX: 0, offsetY: 0, zoom: 1 };

export function getCamera(): Readonly<Camera> {
  return camera;
}

export function setCamera(c: Camera) {
  camera = { ...c, zoom: clamp(c.zoom, MIN_ZOOM, MAX_ZOOM) };
}

export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx - camera.offsetX) / camera.zoom,
    y: (sy - camera.offsetY) / camera.zoom,
  };
}

export function worldToScreen(wx: number, wy: number): { x: number; y: number } {
  return {
    x: wx * camera.zoom + camera.offsetX,
    y: wy * camera.zoom + camera.offsetY,
  };
}

export function zoomAtPoint(screenX: number, screenY: number, newZoom: number) {
  const clamped = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  const wx = (screenX - camera.offsetX) / camera.zoom;
  const wy = (screenY - camera.offsetY) / camera.zoom;
  camera = {
    offsetX: screenX - wx * clamped,
    offsetY: screenY - wy * clamped,
    zoom: clamped,
  };
}

export function resetCamera() {
  camera = { offsetX: 0, offsetY: 0, zoom: 1 };
}

// Space-held flag for pan mode (shared across Canvas + PixiScene)
let _spaceHeld = false;
export function isSpaceHeld(): boolean {
  return _spaceHeld;
}
export function setSpaceHeld(value: boolean) {
  _spaceHeld = value;
}

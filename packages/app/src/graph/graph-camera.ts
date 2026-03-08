import { clamp } from "@/utils/math";

export type GraphCamera = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

let camera: GraphCamera = { offsetX: 0, offsetY: 0, zoom: 1 };

export function getGraphCamera(): Readonly<GraphCamera> {
  return camera;
}

export function setGraphCamera(c: GraphCamera) {
  camera = { ...c, zoom: clamp(c.zoom, MIN_ZOOM, MAX_ZOOM) };
}

export function graphScreenToWorld(
  sx: number,
  sy: number
): { x: number; y: number } {
  return {
    x: (sx - camera.offsetX) / camera.zoom,
    y: (sy - camera.offsetY) / camera.zoom,
  };
}

export function graphWorldToScreen(
  wx: number,
  wy: number
): { x: number; y: number } {
  return {
    x: wx * camera.zoom + camera.offsetX,
    y: wy * camera.zoom + camera.offsetY,
  };
}

export function graphZoomAtPoint(
  screenX: number,
  screenY: number,
  newZoom: number
) {
  const clamped = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  const wx = (screenX - camera.offsetX) / camera.zoom;
  const wy = (screenY - camera.offsetY) / camera.zoom;
  camera = {
    offsetX: screenX - wx * clamped,
    offsetY: screenY - wy * clamped,
    zoom: clamped,
  };
}

export function resetGraphCamera() {
  camera = { offsetX: 0, offsetY: 0, zoom: 1 };
}

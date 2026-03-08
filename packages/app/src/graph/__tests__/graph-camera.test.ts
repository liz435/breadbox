import { describe, test, expect, beforeEach } from "bun:test";
import {
  getGraphCamera,
  setGraphCamera,
  graphScreenToWorld,
  graphWorldToScreen,
  graphZoomAtPoint,
  resetGraphCamera,
} from "../graph-camera";

beforeEach(() => {
  resetGraphCamera();
});

describe("GraphCamera", () => {
  test("initial state is identity", () => {
    const cam = getGraphCamera();
    expect(cam.offsetX).toBe(0);
    expect(cam.offsetY).toBe(0);
    expect(cam.zoom).toBe(1);
  });

  test("setGraphCamera updates state", () => {
    setGraphCamera({ offsetX: 100, offsetY: 200, zoom: 2 });
    const cam = getGraphCamera();
    expect(cam.offsetX).toBe(100);
    expect(cam.offsetY).toBe(200);
    expect(cam.zoom).toBe(2);
  });

  test("zoom is clamped to min", () => {
    setGraphCamera({ offsetX: 0, offsetY: 0, zoom: 0.01 });
    expect(getGraphCamera().zoom).toBe(0.1);
  });

  test("zoom is clamped to max", () => {
    setGraphCamera({ offsetX: 0, offsetY: 0, zoom: 100 });
    expect(getGraphCamera().zoom).toBe(5);
  });

  test("screenToWorld at identity is passthrough", () => {
    const { x, y } = graphScreenToWorld(100, 200);
    expect(x).toBe(100);
    expect(y).toBe(200);
  });

  test("screenToWorld accounts for offset", () => {
    setGraphCamera({ offsetX: 50, offsetY: 50, zoom: 1 });
    const { x, y } = graphScreenToWorld(100, 200);
    expect(x).toBe(50);
    expect(y).toBe(150);
  });

  test("screenToWorld accounts for zoom", () => {
    setGraphCamera({ offsetX: 0, offsetY: 0, zoom: 2 });
    const { x, y } = graphScreenToWorld(100, 200);
    expect(x).toBe(50);
    expect(y).toBe(100);
  });

  test("worldToScreen is inverse of screenToWorld", () => {
    setGraphCamera({ offsetX: 30, offsetY: -20, zoom: 1.5 });
    const world = graphScreenToWorld(150, 250);
    const screen = graphWorldToScreen(world.x, world.y);
    expect(Math.round(screen.x)).toBe(150);
    expect(Math.round(screen.y)).toBe(250);
  });

  test("zoomAtPoint preserves world point under cursor", () => {
    setGraphCamera({ offsetX: 10, offsetY: 20, zoom: 1 });
    const screenX = 200;
    const screenY = 300;
    const worldBefore = graphScreenToWorld(screenX, screenY);
    graphZoomAtPoint(screenX, screenY, 2);
    const worldAfter = graphScreenToWorld(screenX, screenY);
    expect(Math.abs(worldAfter.x - worldBefore.x)).toBeLessThan(0.001);
    expect(Math.abs(worldAfter.y - worldBefore.y)).toBeLessThan(0.001);
  });

  test("resetGraphCamera returns to identity", () => {
    setGraphCamera({ offsetX: 100, offsetY: 200, zoom: 3 });
    resetGraphCamera();
    const cam = getGraphCamera();
    expect(cam.offsetX).toBe(0);
    expect(cam.offsetY).toBe(0);
    expect(cam.zoom).toBe(1);
  });
});

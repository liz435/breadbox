import type { GraphNode, Edge } from "@dreamer/schemas";
import { createGraphNode } from "./node-factory";

/**
 * Creates a minimal Pong game using Godot-style architecture.
 *
 * Each sprite has its own inline script — no separate code nodes,
 * input maps, event nodes, or output nodes needed.
 *
 * Graph layout (just 3 nodes, no edges):
 *
 *   [Ball]          (sprite + script)
 *   [Left Paddle]   (sprite + script)
 *   [Right Paddle]  (sprite + script)
 *
 * All sprites render by default (no output node required).
 * Scripts use the global `Input` object for keyboard input.
 * Scripts use `self` to move their own entity.
 * Scripts use `entities.get("Name")` for cross-entity access.
 */
export function createPongDemo(): {
  nodes: Record<string, GraphNode>;
  edges: Record<string, Edge>;
} {
  const ball = createGraphNode("sprite", {
    id: "pong-ball",
    name: "Ball",
    x: 60,
    y: 60,
    data: {
      tint: "#ffffff",
      sceneX: 0,
      sceneY: 0,
      width: 16,
      height: 16,
      script: BALL_SCRIPT,
    },
  });

  const paddleLeft = createGraphNode("sprite", {
    id: "pong-paddle-left",
    name: "Left Paddle",
    x: 60,
    y: 260,
    data: {
      tint: "#4a9eff",
      sceneX: -350,
      sceneY: 0,
      width: 16,
      height: 80,
      script: LEFT_PADDLE_SCRIPT,
    },
  });

  const paddleRight = createGraphNode("sprite", {
    id: "pong-paddle-right",
    name: "Right Paddle",
    x: 60,
    y: 440,
    data: {
      tint: "#ff4a4a",
      sceneX: 350,
      sceneY: 0,
      width: 16,
      height: 80,
      script: RIGHT_PADDLE_SCRIPT,
    },
  });

  const nodes: Record<string, GraphNode> = {
    [ball.id]: ball,
    [paddleLeft.id]: paddleLeft,
    [paddleRight.id]: paddleRight,
  };

  // No edges needed — everything is self-contained
  const edges: Record<string, Edge> = {};

  return { nodes, edges };
}

// ── Scripts ──────────────────────────────────────────────────────────────────

const BALL_SCRIPT = `// Ball — moves, bounces off walls and paddles
const SPEED = 250;
const HALF_W = 400;
const HALF_H = 300;
const PADDLE_H = 40;

// Init on first frame
if (state.vx === undefined) {
  state.vx = SPEED;
  state.vy = SPEED * 0.6;
  state.scoreL = 0;
  state.scoreR = 0;
}

// Move
self.x += state.vx * dt;
self.y += state.vy * dt;

// Top/bottom bounce
if (self.y < -HALF_H + 8 || self.y > HALF_H - 8) {
  state.vy *= -1;
  self.y = Math.max(-HALF_H + 8, Math.min(HALF_H - 8, self.y));
}

// Left paddle collision
const lp = entities.get("Left Paddle");
if (lp && self.x < -340 && self.x > -360 && state.vx < 0 &&
    Math.abs(self.y - lp.y) < PADDLE_H + 8) {
  state.vx = Math.abs(state.vx) * 1.05;
  state.vy += (self.y - lp.y) * 3;
  self.x = -340;
}

// Right paddle collision
const rp = entities.get("Right Paddle");
if (rp && self.x > 340 && self.x < 360 && state.vx > 0 &&
    Math.abs(self.y - rp.y) < PADDLE_H + 8) {
  state.vx = -Math.abs(state.vx) * 1.05;
  state.vy += (self.y - rp.y) * 3;
  self.x = 340;
}

// Score — reset ball
if (self.x < -HALF_W) {
  state.scoreR++;
  self.x = 0; self.y = 0;
  state.vx = SPEED;
  state.vy = SPEED * (Math.random() - 0.5);
}
if (self.x > HALF_W) {
  state.scoreL++;
  self.x = 0; self.y = 0;
  state.vx = -SPEED;
  state.vy = SPEED * (Math.random() - 0.5);
}

// Cap velocity
state.vx = Math.max(-600, Math.min(600, state.vx));
state.vy = Math.max(-400, Math.min(400, state.vy));

console.log(state.scoreL + " - " + state.scoreR);
`;

const LEFT_PADDLE_SCRIPT = `// Left Paddle — Player 1 (W/S keys)
const SPEED = 400;
const HALF_H = 300;
const PADDLE_H = 40;

if (Input.isKeyPressed("w") || Input.isKeyPressed("W")) {
  self.y -= SPEED * dt;
}
if (Input.isKeyPressed("s") || Input.isKeyPressed("S")) {
  self.y += SPEED * dt;
}

// Clamp to screen
self.y = Math.max(-HALF_H + PADDLE_H, Math.min(HALF_H - PADDLE_H, self.y));
`;

const RIGHT_PADDLE_SCRIPT = `// Right Paddle — Player 2 (Arrow keys)
const SPEED = 400;
const HALF_H = 300;
const PADDLE_H = 40;

if (Input.isKeyPressed("ArrowUp")) {
  self.y -= SPEED * dt;
}
if (Input.isKeyPressed("ArrowDown")) {
  self.y += SPEED * dt;
}

// Clamp to screen
self.y = Math.max(-HALF_H + PADDLE_H, Math.min(HALF_H - PADDLE_H, self.y));
`;

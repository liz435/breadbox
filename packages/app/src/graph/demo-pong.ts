import type { GraphNode, Edge } from "@dreamer/schemas";
import { createGraphNode } from "./node-factory";

/**
 * Creates a minimal Pong game using the node graph system.
 *
 * Graph layout:
 *
 *   [On Update] ──trigger──▶ [Pong Logic (code)]
 *   [On Input]  ──trigger──▶
 *
 *   [Ball]    (sprite)
 *   [Left Paddle]  (sprite)
 *   [Right Paddle]  (sprite)
 *
 * The code node uses `entities` API to move the ball and paddles,
 * and `state` to persist positions/velocities across frames.
 */
export function createPongDemo(): {
  nodes: Record<string, GraphNode>;
  edges: Record<string, Edge>;
} {
  // ── Sprites ──────────────────────────────────────────────────────────────

  const ball = createGraphNode("sprite", {
    id: "pong-ball",
    name: "Ball",
    x: 60,
    y: 260,
    data: { tint: "#ffffff", sceneX: 0, sceneY: 0, width: 16, height: 16 },
  });

  const paddleLeft = createGraphNode("sprite", {
    id: "pong-paddle-left",
    name: "Left Paddle",
    x: 60,
    y: 60,
    data: { tint: "#4a9eff", sceneX: -350, sceneY: 0, width: 16, height: 80 },
  });

  const paddleRight = createGraphNode("sprite", {
    id: "pong-paddle-right",
    name: "Right Paddle",
    x: 60,
    y: 440,
    data: { tint: "#ff4a4a", sceneX: 350, sceneY: 0, width: 16, height: 80 },
  });

  // ── Event nodes ──────────────────────────────────────────────────────────

  const onUpdate = createGraphNode("on_update", {
    id: "pong-on-update",
    name: "On Update",
    x: 340,
    y: 60,
  });

  const onInput = createGraphNode("on_input", {
    id: "pong-on-input",
    name: "On Input",
    x: 340,
    y: 200,
    data: { listenKeys: ["w", "s", "ArrowUp", "ArrowDown"] },
  });

  // ── Logic ────────────────────────────────────────────────────────────────

  const pongCode = createGraphNode("code", {
    id: "pong-logic",
    name: "Pong Logic",
    x: 620,
    y: 60,
    data: {
      language: "javascript",
      code: PONG_SCRIPT,
    },
  });

  // ── Edges ────────────────────────────────────────────────────────────────

  const edges: Record<string, Edge> = {};

  const e1: Edge = {
    id: "pong-edge-update-trigger",
    sourceNodeId: onUpdate.id,
    sourcePortId: "trigger_out",
    targetNodeId: pongCode.id,
    targetPortId: "trigger_in",
  };
  edges[e1.id] = e1;

  const e2: Edge = {
    id: "pong-edge-input-data",
    sourceNodeId: onInput.id,
    sourcePortId: "key_out",
    targetNodeId: pongCode.id,
    targetPortId: "data_in",
  };
  edges[e2.id] = e2;

  // ── Assemble ─────────────────────────────────────────────────────────────

  const nodes: Record<string, GraphNode> = {
    [ball.id]: ball,
    [paddleLeft.id]: paddleLeft,
    [paddleRight.id]: paddleRight,
    [onUpdate.id]: onUpdate,
    [onInput.id]: onInput,
    [pongCode.id]: pongCode,
  };

  return { nodes, edges };
}

// ── Pong game script ─────────────────────────────────────────────────────────

const PONG_SCRIPT = `// Pong — runs every frame via On Update trigger
const PADDLE_SPEED = 300;
const BALL_SPEED = 250;
const HALF_W = 400;
const HALF_H = 300;
const PADDLE_H = 40;

// Init state on first frame
if (state.ballVX === undefined) {
  state.ballX = 0;
  state.ballY = 0;
  state.ballVX = BALL_SPEED;
  state.ballVY = BALL_SPEED * 0.6;
  state.leftY = 0;
  state.rightY = 0;
  state.scoreL = 0;
  state.scoreR = 0;
}

// ── Input ──
// W/S move left paddle, ArrowUp/ArrowDown move right paddle
const keys = input.data_in;
if (keys) {
  const k = typeof keys === 'object' && keys !== null && 'value' in keys ? keys.value : keys;
  if (k === 'w') state.leftY -= PADDLE_SPEED * dt;
  if (k === 's') state.leftY += PADDLE_SPEED * dt;
  if (k === 'ArrowUp') state.rightY -= PADDLE_SPEED * dt;
  if (k === 'ArrowDown') state.rightY += PADDLE_SPEED * dt;
}

// Clamp paddles to screen
state.leftY = Math.max(-HALF_H + PADDLE_H, Math.min(HALF_H - PADDLE_H, state.leftY));
state.rightY = Math.max(-HALF_H + PADDLE_H, Math.min(HALF_H - PADDLE_H, state.rightY));

// ── Ball movement ──
state.ballX += state.ballVX * dt;
state.ballY += state.ballVY * dt;

// Top/bottom bounce
if (state.ballY < -HALF_H + 8 || state.ballY > HALF_H - 8) {
  state.ballVY *= -1;
  state.ballY = Math.max(-HALF_H + 8, Math.min(HALF_H - 8, state.ballY));
}

// Left paddle collision
if (
  state.ballX < -340 &&
  state.ballX > -360 &&
  state.ballVX < 0 &&
  Math.abs(state.ballY - state.leftY) < PADDLE_H + 8
) {
  state.ballVX = Math.abs(state.ballVX) * 1.05;
  state.ballVY += (state.ballY - state.leftY) * 3;
  state.ballX = -340;
}

// Right paddle collision
if (
  state.ballX > 340 &&
  state.ballX < 360 &&
  state.ballVX > 0 &&
  Math.abs(state.ballY - state.rightY) < PADDLE_H + 8
) {
  state.ballVX = -Math.abs(state.ballVX) * 1.05;
  state.ballVY += (state.ballY - state.rightY) * 3;
  state.ballX = 340;
}

// Score — reset ball
if (state.ballX < -HALF_W) {
  state.scoreR++;
  state.ballX = 0;
  state.ballY = 0;
  state.ballVX = BALL_SPEED;
  state.ballVY = BALL_SPEED * (Math.random() - 0.5);
}
if (state.ballX > HALF_W) {
  state.scoreL++;
  state.ballX = 0;
  state.ballY = 0;
  state.ballVX = -BALL_SPEED;
  state.ballVY = BALL_SPEED * (Math.random() - 0.5);
}

// Cap ball velocity
state.ballVX = Math.max(-600, Math.min(600, state.ballVX));
state.ballVY = Math.max(-400, Math.min(400, state.ballVY));

// ── Write to entities ──
const ball = entities.get("Ball");
if (ball) ball.setPosition(state.ballX, state.ballY);

const lp = entities.get("Left Paddle");
if (lp) lp.setPosition(-350, state.leftY);

const rp = entities.get("Right Paddle");
if (rp) rp.setPosition(350, state.rightY);

console.log(state.scoreL + " - " + state.scoreR);
`;

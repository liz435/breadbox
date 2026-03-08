import type { GraphNode, Edge } from "@dreamer/schemas";
import { createGraphNode } from "./node-factory";

/**
 * Creates a minimal Pong game using the node graph system.
 *
 * Graph layout:
 *
 *   [Ball]           (sprite)
 *   [Left Paddle]    (sprite) ──entity──▶ [Pong Logic]
 *   [Right Paddle]   (sprite) ──entity──▶ [Pong Logic]
 *
 *   [On Update]      ──trigger──▶ [Pong Logic (code)]
 *   [Player 1 Input] ──data_0──▶  [Pong Logic]
 *   [Player 2 Input] ──data_1──▶  [Pong Logic]
 *
 * Input maps provide configurable key bindings per player.
 * The code node reads action states (move_up/move_down) from each input map
 * and accesses paddles via entity ports. No hardcoded keys in the script.
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

  // ── Input maps (one per player) ──────────────────────────────────────────

  const p1Input = createGraphNode("input_map", {
    id: "pong-p1-input",
    name: "Player 1 Controls",
    x: 340,
    y: 200,
    data: {
      actions: [
        { name: "move_up", label: "Move Up", keys: ["w", "W"] },
        { name: "move_down", label: "Move Down", keys: ["s", "S"] },
      ],
    },
  });

  const p2Input = createGraphNode("input_map", {
    id: "pong-p2-input",
    name: "Player 2 Controls",
    x: 340,
    y: 360,
    data: {
      actions: [
        { name: "move_up", label: "Move Up", keys: ["ArrowUp"] },
        { name: "move_down", label: "Move Down", keys: ["ArrowDown"] },
      ],
    },
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

  // On Update → trigger
  const e1: Edge = {
    id: "pong-edge-update-trigger",
    sourceNodeId: onUpdate.id,
    sourcePortId: "trigger_out",
    targetNodeId: pongCode.id,
    targetPortId: "trigger_in",
  };
  edges[e1.id] = e1;

  // Player 1 input map → Data A
  const e2: Edge = {
    id: "pong-edge-p1-input",
    sourceNodeId: p1Input.id,
    sourcePortId: "actions_out",
    targetNodeId: pongCode.id,
    targetPortId: "data_0_in",
  };
  edges[e2.id] = e2;

  // Player 2 input map → Data B
  const e3: Edge = {
    id: "pong-edge-p2-input",
    sourceNodeId: p2Input.id,
    sourcePortId: "actions_out",
    targetNodeId: pongCode.id,
    targetPortId: "data_1_in",
  };
  edges[e3.id] = e3;

  // Left Paddle → Entity A
  const e4: Edge = {
    id: "pong-edge-paddle-left",
    sourceNodeId: paddleLeft.id,
    sourcePortId: "entity_out",
    targetNodeId: pongCode.id,
    targetPortId: "entity_0_in",
  };
  edges[e4.id] = e4;

  // Right Paddle → Entity B
  const e5: Edge = {
    id: "pong-edge-paddle-right",
    sourceNodeId: paddleRight.id,
    sourcePortId: "entity_out",
    targetNodeId: pongCode.id,
    targetPortId: "entity_1_in",
  };
  edges[e5.id] = e5;

  // ── Assemble ─────────────────────────────────────────────────────────────

  const nodes: Record<string, GraphNode> = {
    [ball.id]: ball,
    [paddleLeft.id]: paddleLeft,
    [paddleRight.id]: paddleRight,
    [onUpdate.id]: onUpdate,
    [p1Input.id]: p1Input,
    [p2Input.id]: p2Input,
    [pongCode.id]: pongCode,
  };

  return { nodes, edges };
}

// ── Pong game script ─────────────────────────────────────────────────────────

const PONG_SCRIPT = `// Pong — runs every frame via On Update trigger
// Controls come from Input Map nodes wired to Data A (P1) and Data B (P2)
// Paddles come from Entity A (left) and Entity B (right)
const PADDLE_SPEED = 400;
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

// ── Input from Input Map nodes ──
// data_0_in = Player 1 actions, data_1_in = Player 2 actions
const p1 = input.data_0_in || {};
const p2 = input.data_1_in || {};

if (p1.move_up) state.leftY -= PADDLE_SPEED * dt;
if (p1.move_down) state.leftY += PADDLE_SPEED * dt;
if (p2.move_up) state.rightY -= PADDLE_SPEED * dt;
if (p2.move_down) state.rightY += PADDLE_SPEED * dt;

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
// Ball uses entities.get() by name (not wired via port)
const ball = entities.get("Ball");
if (ball) ball.setPosition(state.ballX, state.ballY);

// Paddles accessed via entity ports (resolved to names by runtime)
const lp = entities.get(input.entity_0_in);
if (lp) lp.setPosition(-350, state.leftY);

const rp = entities.get(input.entity_1_in);
if (rp) rp.setPosition(350, state.rightY);

console.log(state.scoreL + " - " + state.scoreR);
`;

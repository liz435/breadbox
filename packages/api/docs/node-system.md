# Dreamer Node Graph System

The visual programming environment that powers Dreamer's game engine. Nodes represent game entities, behaviors, and data pipelines — connected via typed ports and evaluated in topological order each frame.

## Architecture Overview

```
Graph Editor (UI)          Runtime Loop              Renderer
┌─────────────────┐   ┌─────────────────────┐   ┌──────────────┐
│ Nodes & Edges   │──▶│ Topological Eval    │──▶│ Three.js     │
│ XState Machine  │   │ Script Worker       │   │ InstancedMesh│
│ Undo/Redo       │   │ Entity Store        │   │ Audio API    │
└─────────────────┘   └─────────────────────┘   └──────────────┘
```

- **Graph Machine** (XState): Manages nodes, edges, selection, undo/redo
- **Runtime Loop**: Evaluates the graph each frame, runs scripts in a Web Worker
- **Viewport Renderer**: Three.js orthographic renderer with batched sprite instancing

---

## Node Types

### Game Entities

#### sprite
The primary game entity. Renders as a colored rectangle (or textured quad). Can have an inline `script` that runs every frame.

| Port | Direction | Type |
|------|-----------|------|
| `shader_in` | in | shader |
| `material_in` | in | material |
| `texture_out` | out | texture |
| `entity_out` | out | entity |

**Data fields:**
- `tint: string` — Hex color (default `"#4a9eff"`)
- `sceneX: number` — X position in scene (default `0`)
- `sceneY: number` — Y position in scene (default `0`)
- `width: number` — Sprite width in pixels (default `64`)
- `height: number` — Sprite height in pixels (default `64`)
- `script: string` — Inline behavior code (optional)
- `uri: string` — Texture URI (optional; solid color if omitted)

**Graph node size:** 200 × 150

---

### Behavior & Logic

#### code
Standalone behavior script for complex multi-entity logic. Wired via graph edges.

| Port | Direction | Type |
|------|-----------|------|
| `trigger_in` | in | trigger |
| `data_0_in` "Data A" | in | any |
| `data_1_in` "Data B" | in | any |
| `trigger_out` | out | trigger |
| `data_out` | out | any |

**Data fields:**
- `language: string` — `"typescript"` (default)
- `code: string` — Script source

**Graph node size:** 220 × 160

#### input_map
Configurable key bindings that output action states.

| Port | Direction | Type |
|------|-----------|------|
| `actions_out` | out | any |

**Data fields:**
- `actions: Array<{ name, label, keys }>` — Action-to-key mappings

**Graph node size:** 200 × 140

#### on_start
Fires once when runtime starts.

| Port | Direction | Type |
|------|-----------|------|
| `trigger_out` | out | trigger |

**Graph node size:** 160 × 70

#### on_update
Fires every frame.

| Port | Direction | Type |
|------|-----------|------|
| `trigger_out` | out | trigger |
| `dt_out` | out | float |

**Graph node size:** 160 × 80

#### on_input
Raw keyboard event node.

| Port | Direction | Type |
|------|-----------|------|
| `trigger_out` | out | trigger |
| `key_out` | out | string |

**Data fields:**
- `listenKeys: string[]` — Keys to listen for

**Graph node size:** 160 × 80

---

### Media & Data

#### shader
GLSL/WGSL shader code.

| Port | Direction | Type |
|------|-----------|------|
| `texture_in` | in | texture |
| `float_in` | in | float |
| `color_in` | in | color |
| `shader_out` | out | shader |

**Data fields:**
- `language: string` — `"glsl"` or `"wgsl"`
- `code: string` — Shader source

**Graph node size:** 220 × 160

#### audio
Sound playback node.

| Port | Direction | Type |
|------|-----------|------|
| `trigger_in` | in | trigger |
| `volume_in` | in | float |
| `pitch_in` | in | float |
| `audio_out` | out | audio |
| `on_complete` | out | trigger |

**Data fields:**
- `volume: number` — 0–1 (default `1.0`)
- `pitch: number` — Playback rate (default `1.0`)
- `loop: boolean` — Loop playback (default `false`)

**Graph node size:** 200 × 140

#### video
Video playback node.

| Port | Direction | Type |
|------|-----------|------|
| `trigger_in` | in | trigger |
| `rate_in` | in | float |
| `texture_out` | out | texture |
| `audio_out` | out | audio |

**Data fields:**
- `playbackRate: number` — (default `1.0`)
- `loop: boolean` — (default `false`)

**Graph node size:** 200 × 170

#### text
String/data content node.

| Port | Direction | Type |
|------|-----------|------|
| `vars_in` | in | any |
| `string_out` | out | string |

**Data fields:**
- `content: string`

**Graph node size:** 200 × 120

#### material
Combines texture + shader into a material.

| Port | Direction | Type |
|------|-----------|------|
| `base_texture_in` | in | texture |
| `normal_in` | in | texture |
| `shader_in` | in | shader |
| `material_out` | out | material |

**Data fields:**
- `blend: string` — Blend mode (default `"normal"`)

**Graph node size:** 200 × 120

#### math
Arithmetic operations.

| Port | Direction | Type |
|------|-----------|------|
| `a_in` | in | float |
| `b_in` | in | float |
| `result_out` | out | float |

**Data fields:**
- `operation: string` — One of: `add`, `subtract`, `multiply`, `divide`, `lerp`, `clamp`, `min`, `max`, `abs`, `sin`, `cos`, `random`

**Graph node size:** 140 × 80

#### group
Organizational container. No ports, no behavior.

**Graph node size:** 240 × 180

---

### Scene Composition

#### composer
Bundles sprites for explicit rendering control.

| Port | Direction | Type |
|------|-----------|------|
| `entities_in` | in | entity (multi-input) |
| `scene_out` | out | any |

**Graph node size:** 200 × 100

#### output
Rendering gate. When present, only sprites reachable from output nodes render. Without an output node, **all sprites render** (Godot-style default).

| Port | Direction | Type |
|------|-----------|------|
| `scene_in` | in | any |
| `texture_in` | in | texture |
| `audio_in` | in | audio |

**Data fields:**
- `background: string` — Background color (default `"#000000"`)
- `resolution: { width, height }` — (default `800 × 600`)

**Graph node size:** 200 × 120

---

## Port System

### Data Types

| Type | Color | Description |
|------|-------|-------------|
| `texture` | `#3b82f6` blue | Sprite visual data |
| `float` | `#22c55e` green | Numeric value |
| `vec2` | `#a855f7` purple | 2D vector |
| `color` | `#f59e0b` amber | Color value |
| `audio` | `#ec4899` pink | Audio stream |
| `trigger` | `#ef4444` red | Event signal |
| `entity` | `#06b6d4` cyan | Entity reference |
| `string` | `#f97316` orange | Text data |
| `shader` | `#8b5cf6` violet | Shader program |
| `material` | `#14b8a6` teal | Material (texture + shader) |
| `any` | `#6b7280` gray | Universal (compatible with all types) |

### Compatibility Rules

- Connections go from **out** port → **in** port only
- Types must match exactly, **except** `any` which is compatible with everything
- No self-loops or cycles allowed
- Multi-input supported only on specific ports (e.g., `composer.entities_in`)

---

## Graph Operations

All graph mutations are expressed as `GraphOp` discriminated unions:

```typescript
type GraphOp =
  | { kind: "create_graph_node"; payload: { node: GraphNode } }
  | { kind: "delete_graph_node"; payload: { nodeId: string; cascade?: boolean } }
  | { kind: "move_graph_node"; payload: { nodeId: string; x: number; y: number } }
  | { kind: "update_graph_node_data"; payload: { nodeId: string; patch: Record<string, unknown> } }
  | { kind: "create_edge"; payload: { edge: Edge } }
  | { kind: "delete_edge"; payload: { edgeId: string } }
```

Each op also carries metadata: `opId`, `projectId`, `sceneId`, `expectedVersion`, `timestamp`.

---

## Script API

All scripts (sprite inline scripts and code node scripts) execute in a sandboxed Web Worker with these globals:

### Core

| Name | Type | Description |
|------|------|-------------|
| `dt` | `number` | Delta time since last frame (seconds) |
| `time` | `number` | Total elapsed time since start (seconds) |
| `state` | `Record<string, unknown>` | Persistent object that survives across frames |
| `console` | `{ log(...args) }` | Log to runtime console |

### Entity Access

| Name | Type | Description |
|------|------|-------------|
| `self` | `EntityHandle \| null` | This sprite's entity (sprite scripts only; `null` in code nodes) |
| `entities.get(name)` | `EntityHandle \| null` | Get entity by sprite name |
| `entities.list()` | `string[]` | List all entity names |

### Input

| Name | Type | Description |
|------|------|-------------|
| `Input.isKeyPressed(key)` | `boolean` | Check if a key is currently pressed |
| `Input.keys` | `string[]` | Array of all currently pressed keys |

### Code Nodes Only

| Name | Type | Description |
|------|------|-------------|
| `input` | `Record<string, unknown>` | Resolved values from connected input ports |

### EntityHandle Properties

```typescript
{
  x: number           // Scene X position
  y: number           // Scene Y position
  scaleX: number      // Horizontal scale (default 1)
  scaleY: number      // Vertical scale (default 1)
  rotation: number    // Rotation in radians
  tint: string        // Hex color string
  visible: boolean    // Visibility flag

  setPosition(x, y)   // Set position
  setScale(sx, sy?)   // Set scale (sy defaults to sx)
  translate(dx, dy)   // Move relative to current position
}
```

---

## Graph Evaluation

### Pipeline (per frame)

1. **Input tracking** — Collect pressed keys
2. **Event injection** — Inject runtime values into event node data (`on_start._triggered`, `on_update._dt`, etc.)
3. **Dirty detection** — Event nodes always dirty; other nodes dirty if data changed
4. **Sprite reachability** — BFS backward from output nodes to find renderable sprites. No output node = all sprites render.
5. **Entity sync** — Add/remove sprite entity state based on reachability
6. **Graph eval** — Full eval (frame 1) or partial eval (frames 2+) in topological order
7. **Frame bus publish** — Push snapshot to viewport renderer
8. **Script dispatch** — Send code/sprite scripts to Web Worker with resolved inputs
9. **Apply mutations** — Apply entity changes from previous frame's worker results

### Topological Sort

Uses Kahn's algorithm. Nodes are evaluated from sources (no inputs) to sinks (no outputs). Cycles are detected and reported as errors.

### Partial Evaluation

After frame 1, only dirty nodes and their downstream dependents are re-evaluated. Clean nodes reuse cached outputs.

---

## Rendering

### Viewport

- **Engine:** Three.js with orthographic camera
- **Camera bounds:** X: -400 to 400, Y: -300 to 300
- **Coordinate system:** Center is (0, 0). Y is flipped (positive Y = down in scene, up in Three.js)
- **Clear color:** `#1a1a2e`

### Sprite Rendering

- **InstancedMesh** for batched rendering (up to 1024 instances per batch)
- Separate batches: solid-color sprites + one batch per unique texture URI
- Per sprite: position, scale, rotation, tint color

### Audio

- Web Audio API (`AudioContext`)
- Decoded `AudioBuffer` cached per URI
- Per-node gain (volume) and playback rate (pitch)

---

## XState Graph Machine

### State Shape

```typescript
{
  nodes: Record<string, GraphNode>
  edges: Record<string, Edge>
  selectedNodeIds: Set<string>
  selectedEdgeIds: Set<string>
  _past: GraphState[]     // Undo stack (max 100)
  _future: GraphState[]   // Redo stack
}
```

### Events

| Event | Auto-Snapshot | Description |
|-------|--------------|-------------|
| `ADD_NODE` | yes | Add a new node |
| `REMOVE_NODE` | yes | Remove node + connected edges |
| `MOVE_NODE` | no | Move node position (caller snapshots before drag) |
| `UPDATE_NODE` | no | Patch node data (caller snapshots before edit) |
| `RENAME_NODE` | yes | Change node display name |
| `CHANGE_NODE_TYPE` | yes | Change node type (resets ports) |
| `ADD_EDGE` | yes | Create connection |
| `REMOVE_EDGE` | yes | Delete connection |
| `SELECT_NODES` | no | Set node selection |
| `SELECT_EDGES` | no | Set edge selection |
| `CLEAR_SELECTION` | no | Clear all selection |
| `SNAPSHOT` | — | Manually push to undo stack |
| `UNDO` | — | Pop from `_past`, push to `_future` |
| `REDO` | — | Pop from `_future`, push to `_past` |

---

## Scene Coordinates

- **Origin:** Center of canvas (0, 0)
- **Horizontal range:** roughly -400 to +400
- **Vertical range:** roughly -300 to +300
- **Canvas size:** 800 × 600 pixels (default)
- **Y convention in scripts:** Positive Y is down (matching screen coordinates)

---

## Common Patterns

### Godot-Style (Preferred)

Every sprite has an inline script. No wiring needed.

```javascript
// Player movement
const SPEED = 200;
if (Input.isKeyPressed("ArrowLeft")) self.x -= SPEED * dt;
if (Input.isKeyPressed("ArrowRight")) self.x += SPEED * dt;
```

```javascript
// Cross-entity interaction
const ball = entities.get("Ball");
if (ball && Math.abs(self.x - ball.x) < 30) {
  ball.y *= -1; // bounce
}
```

```javascript
// Persistent state
if (!state.hp) state.hp = 100;
state.hp -= 1;
if (state.hp <= 0) self.visible = false;
```

### Graph-Wired (Advanced)

For complex data pipelines:
```
on_update → code → sprite
input_map → code
shader → material → sprite
```

Code node receives wired inputs via `input.data_0_in`, `input.data_1_in`, etc.

# Dreamer — Visual Node Engine Roadmap

**Approach: Incremental (Option B)**
Keep the existing sprite canvas as a live preview panel. Add the node graph as a new panel alongside it. Each new feature is an incremental addition — nothing breaks while building.

---

## Phase 1: Foundation — Graph Schemas & State (P0)

> Goal: Define the data model for nodes, edges, and ports without touching existing sprite code.

### 1.1 — Node & Edge schemas (`@dreamer/schemas`)
- [ ] `GraphNodeSchema`: `{ id, type, name, x, y, width, height, data, ports }`
- [ ] `PortSchema`: `{ id, name, direction: "in" | "out", dataType, nodeId }`
- [ ] `EdgeSchema`: `{ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId }`
- [ ] `GraphState`: `{ nodes: Record<id, GraphNode>, edges: Record<id, Edge> }`
- [ ] Node types union: `"sprite" | "shader" | "audio" | "video" | "text" | "code" | "material" | "math" | "group"`
- [ ] Port data types union: `"texture" | "float" | "vec2" | "color" | "audio" | "trigger" | "entity" | "string" | "any"`
- [ ] Extend `Asset.type` union with: `"shader" | "audio" | "video" | "text" | "material" | "font"`

### 1.2 — Graph ops (`packages/schemas/src/ops.ts`)
- [ ] New op kinds: `create_graph_node`, `delete_graph_node`, `move_graph_node`, `update_graph_node_data`, `create_edge`, `delete_edge`
- [ ] Reuse existing `OpBase` (opId, projectId, sceneId, expectedVersion, timestamp)
- [ ] No conflict — these are additive to existing ops like `create_entity`

### 1.3 — Graph state machine (new file, parallel to `scene-machine.ts`)
- [ ] Create `packages/app/src/store/graph-machine.ts` — **separate** from scene machine
- [ ] Events: `ADD_NODE | REMOVE_NODE | MOVE_NODE | UPDATE_NODE | ADD_EDGE | REMOVE_EDGE | SELECT_NODES | SELECT_EDGES`
- [ ] Multi-select: `selectedNodeIds: Set<string>`, `selectedEdgeIds: Set<string>`
- [ ] Own undo/redo stack (same snapshot pattern as scene machine)
- [ ] Create `packages/app/src/store/graph-context.ts` — React context provider

### 1.4 — Bridge: graph ↔ scene sync
- [ ] When a sprite-type graph node is created → also dispatch `ADD_SPRITE` to scene machine
- [ ] When a sprite-type graph node is deleted → also dispatch `REMOVE` to scene machine
- [ ] When graph node position changes → does NOT affect sprite position (graph layout ≠ scene position)
- [ ] Sprite transform changes (in inspector/canvas) update graph node `data`, not graph node `x,y`
- [ ] Create `packages/app/src/store/graph-scene-bridge.ts` for this sync logic

**Conflict notes:**
- `types.ts` (`Sprite`, `SceneState`) — **keep as-is**, sprite canvas continues working
- `scene-machine.ts` — **keep as-is**, no modifications needed
- `apply-ops.ts` — **extend** to also handle new graph ops (dispatch to graph machine)

---

## Phase 2: Node Graph Panel (P0)

> Goal: Add a graph editor panel to Dockview alongside the existing canvas.

### 2.1 — Graph panel in Dockview
- [ ] Create `packages/app/src/graph/graph-panel.tsx` — the Dockview panel wrapper
- [ ] Register as new component in `app.tsx`: `graph: GraphPanel`
- [ ] Default layout becomes: Sprite List (15%) | Canvas (40%) | Graph (30%) | Inspector (15%)
- [ ] Inspector adapts: shows sprite props when sprite selected, node props when graph node selected

### 2.2 — Graph renderer (`packages/app/src/graph/`)
- [ ] `graph-canvas.tsx` — container with pan/zoom (CSS transform, reuse `camera.ts` math)
- [ ] `graph-node.tsx` — single node component: header bar (color-coded by type), port dots, content preview
- [ ] `graph-edge.tsx` — SVG bezier curve between connected ports
- [ ] `graph-port.tsx` — clickable port circle, color-coded by data type
- [ ] Render all nodes from `GraphContext` state, edges as SVG overlay

### 2.3 — Graph interactions (new interaction machine)
- [ ] Create `packages/app/src/graph/graph-interaction-machine.ts` — **separate** from sprite interactions
- [ ] States: `idle | dragging_node | connecting | box_selecting | panning`
- [ ] Drag node: move node position in graph
- [ ] Connect: mousedown on output port → drag line → mouseup on compatible input port → create edge
- [ ] Box select: drag empty area to select multiple nodes
- [ ] Pan: middle-click or space+drag
- [ ] Context menu: right-click → add node, delete, disconnect

### 2.4 — Drop zone on graph panel
- [ ] Drop any file onto graph panel → detect type → create appropriate node
- [ ] `.png/.jpg/.gif/.webp` → sprite node (also creates sprite in scene)
- [ ] `.glsl/.wgsl/.frag/.vert` → shader node
- [ ] `.mp3/.wav/.ogg` → audio node
- [ ] `.mp4/.webm` → video node
- [ ] `.ts/.js` → code/script node
- [ ] `.json/.yaml` → data node
- [ ] `.txt/.md` → text node

**Conflict notes:**
- `app.tsx` — **modify**: add `GraphPanel` to Dockview components, update default layout
- `canvas.tsx` drop handler — **keep as-is**, graph panel has its own drop handler
- `interaction-machine.ts` — **keep as-is**, graph has separate interaction machine
- `index.tsx` routing — **keep as-is** for now, `/character` stays separate

---

## Phase 3: Core Node Types (P1)

> Goal: Implement the first useful node types that connect to the existing sprite system.

### 3.1 — Sprite node (wraps existing sprite)
- [ ] Auto-created when sprite is added (via bridge from Phase 1.4)
- [ ] Preview: sprite thumbnail in node body
- [ ] Output ports: `texture`, `entity_ref`
- [ ] Input ports: `shader`, `material`
- [ ] Selecting sprite node in graph → selects sprite in canvas (and vice versa)

### 3.2 — Shader node
- [ ] Embedded code editor (CodeMirror — lighter than Monaco)
- [ ] Input ports: uniforms (`float`, `vec2`, `texture`, `color`, `time`)
- [ ] Output port: `shader_program`
- [ ] Connect shader output → sprite shader input → applies to sprite rendering in PixiJS canvas
- [ ] New asset type: `"shader"` with `meta.language: "glsl" | "wgsl"`

### 3.3 — Code/Script node
- [ ] TypeScript/JS editor (CodeMirror)
- [ ] Uses existing `ScriptComponent` schema
- [ ] `exportedVars` auto-generate input ports
- [ ] Output ports: `trigger`, `data`
- [ ] Runs in sandboxed context (Phase 7)

### 3.4 — Audio node
- [ ] Waveform preview (Web Audio API `AnalyserNode`)
- [ ] Input ports: `trigger` (play/stop/pause), `volume` (float), `pitch` (float)
- [ ] Output ports: `audio_stream`, `on_complete` (trigger)
- [ ] New asset type: `"audio"`

### 3.5 — Video node
- [ ] `<video>` thumbnail preview in node body
- [ ] Input ports: `trigger`, `playback_rate`
- [ ] Output ports: `texture` (current frame), `audio_stream`
- [ ] New asset type: `"video"`

### 3.6 — Text/Data node
- [ ] Editable text area or JSON editor in node body
- [ ] Output ports: `string`, `structured_data`
- [ ] Input port: `template_vars` (for string interpolation)

### 3.7 — Material node
- [ ] Combines texture + shader + parameters
- [ ] Input ports: `base_texture`, `normal_map`, `shader`
- [ ] Output port: `material`

### 3.8 — Math/Logic nodes (small utility nodes)
- [ ] `Add`, `Multiply`, `Lerp`, `Clamp`, `If`, `Compare`, `Random`, `Time`
- [ ] 1-2 inputs, 1 output, no preview — just compact nodes

---

## Phase 4: Connection Engine (P1)

> Goal: Make edges actually do something — data flows between nodes.

### 4.1 — Port type system
- [ ] Type compatibility map: which output types can connect to which input types
- [ ] Auto-conversion where safe (e.g., `float` → `vec2` as `{x: v, y: v}`)
- [ ] Visual: color-code ports by data type, gray out incompatible ports during connecting
- [ ] Prevent cycles (no output → ... → same node's input)

### 4.2 — Graph evaluation engine (`packages/app/src/graph/evaluate.ts`)
- [ ] Topological sort of connected nodes
- [ ] Pull-based: when a node needs its input value, resolve from connected output
- [ ] Dirty tracking: only re-evaluate subgraphs whose inputs changed
- [ ] Cycle detection → show error on offending edge

### 4.3 — Live preview pipeline
- [ ] Shader → sprite: compile shader, create PixiJS filter, apply to sprite in canvas
- [ ] Audio → trigger: wire up Web Audio API playback
- [ ] Script → entity: bind script behavior to sprite entity
- [ ] Re-evaluate on: edge create/delete, node data change, input value change

---

## Phase 5: UI Polish & Asset Management (P1)

### 5.1 — Unified inspector
- [ ] Inspector detects what's selected: sprite in canvas → show transform/sprite props; node in graph → show node-specific props + port list
- [ ] Port inspector: show connected edges, data type, current value

### 5.2 — Asset library panel (new Dockview panel)
- [ ] Lists all project assets (images, shaders, audio, video, scripts)
- [ ] Filter by type, search by name
- [ ] Drag asset from library → onto graph to create node
- [ ] Thumbnail previews

### 5.3 — Minimap
- [ ] Small overview of graph in corner of graph panel
- [ ] Viewport indicator, click to navigate

### 5.4 — Node search / command palette
- [ ] `Ctrl+K` or `/` to open — search and add any node type
- [ ] Fuzzy search across node types

---

## Phase 6: AI Agent Upgrades (P2)

### 6.1 — Graph-aware agent tools
- [ ] `create_graph_node` — create any node type with initial ports and data
- [ ] `connect_nodes` — wire output port to input port
- [ ] `disconnect_nodes` — remove edge
- [ ] `list_graph` — return nodes + edges for context
- [ ] `update_node_data` — modify node content (shader code, script, etc.)

### 6.2 — Shader agent (new specialist)
- [ ] System prompt with GLSL/WGSL knowledge
- [ ] Tools: `create_shader`, `update_shader_code`, `set_uniform`
- [ ] Delegated from core agent

### 6.3 — Audio agent (new specialist)
- [ ] Tools: `import_audio`, `set_audio_params`, `create_audio_chain`

### 6.4 — Composition agent
- [ ] High-level: "make a glowing character" → sprite node + shader node + edge
- [ ] Understands graph topology, can reason about data flow

### 6.5 — Update `apply-ops.ts`
- [ ] Handle new graph ops: dispatch to graph machine
- [ ] Keep existing sprite op handling intact

---

## Phase 7: Execution & Runtime (P3)

### 7.1 — Play mode
- [ ] Play/pause/stop in toolbar
- [ ] Script nodes execute in sandboxed context
- [ ] Trigger edges fire events between nodes
- [ ] Physics simulation (existing `PhysicsBodyComponent`)

### 7.2 — Event nodes
- [ ] `OnStart`, `OnUpdate`, `OnCollision`, `OnInput`
- [ ] Connect to script/logic nodes for gameplay behavior

### 7.3 — Export
- [ ] Compile graph → optimized execution plan
- [ ] Bundle as standalone web game (HTML + JS)

---

## Phase 8: Merge Character Flow (P3)

### 8.1 — Fold `/character` into main app
- [ ] Character creator becomes a panel or node type in the main editor
- [ ] Remove separate route, character page lives inside the unified canvas
- [ ] Character chat panel → dockable panel in Dockview

---

## Priority Summary

| Priority | What | Depends on |
|----------|------|------------|
| **P0** | Phase 1 — schemas, graph state, bridge | Nothing |
| **P0** | Phase 2 — graph panel, renderer, interactions | Phase 1 |
| **P1** | Phase 3.1–3.2 — sprite + shader nodes | Phase 2 |
| **P1** | Phase 4 — connection engine | Phase 3.1 |
| **P1** | Phase 5.1 — unified inspector | Phase 2 |
| **P1** | Phase 3.3–3.8 — remaining node types | Phase 4 |
| **P1** | Phase 5.2–5.4 — asset library, minimap, search | Phase 3 |
| **P2** | Phase 6 — AI agents | Phase 4 |
| **P3** | Phase 7 — runtime | Phase 4 + 6 |
| **P3** | Phase 8 — merge character flow | Phase 5 |

---

## Files That Change vs Stay

### Keep as-is (no modifications)
- `packages/app/src/ecs/` — already generic
- `packages/app/src/types.ts` — sprite types stay, used by canvas
- `packages/app/src/store/scene-machine.ts` — sprite scene stays
- `packages/app/src/store/scene-context.ts` — sprite context stays
- `packages/app/src/canvas/` — PixiJS canvas stays as preview
- `packages/app/src/interaction/` — sprite interactions stay
- `packages/app/src/index.tsx` — routing stays (until Phase 8)
- `packages/api/src/agents/sprite/` — sprite agent stays
- `packages/api/src/agents/coding/` — coding agent stays
- `packages/api/src/db/` — persistence stays

### Modify (extend, not rewrite)
- `packages/app/src/app.tsx` — add graph panel to Dockview components + layout
- `packages/app/src/panels/inspector.tsx` — detect graph node vs sprite selection
- `packages/app/src/chat/apply-ops.ts` — add cases for graph ops
- `packages/schemas/src/ops.ts` — add graph op kinds to union
- `packages/schemas/src/project.ts` — add graph state to `ProjectFile`
- `packages/api/src/agents/core/tools.ts` — add graph tools

### Create new
- `packages/app/src/graph/` — entire graph subsystem (renderer, interactions, nodes)
- `packages/app/src/store/graph-machine.ts` — graph state machine
- `packages/app/src/store/graph-context.ts` — graph React context
- `packages/app/src/store/graph-scene-bridge.ts` — sync between graph ↔ scene
- `packages/schemas/src/graph.ts` — graph schemas
- `packages/api/src/agents/shader/` — shader specialist agent
- `packages/api/src/agents/audio/` — audio specialist agent

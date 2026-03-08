# Dreamer — Changelog

## Phase 1: Foundation — Graph Schemas & State

Defined the data model for nodes, edges, and ports. Built the graph state machine and scene sync bridge.

### Schemas (`packages/schemas/src/`)

- **graph.ts** — Core graph data models:
  - `portDataTypeSchema`: 11 types (texture, float, vec2, color, audio, trigger, entity, string, shader, material, any)
  - `portSchema`: id, name, direction (`"in" | "out"`), dataType
  - `graphNodeTypeSchema`: 12 node types (sprite, shader, audio, video, text, code, material, math, group, on_start, on_update, on_input)
  - `graphNodeSchema`: id, type, name, x, y, width, height, ports, data
  - `edgeSchema`: id, sourceNodeId, sourcePortId, targetNodeId, targetPortId
  - `graphStateSchema`: nodes + edges as record maps
  - Port compatibility system: `COMPATIBLE_TYPES` map + `arePortsCompatible()` function
  - Default port generator: `getDefaultPorts()` returning specific ports per node type

- **graph-ops.ts** — Graph mutation operations (discriminated union):
  - `create_graph_node`, `delete_graph_node`, `move_graph_node`, `update_graph_node_data`, `create_edge`, `delete_edge`
  - Reuses existing `OpBase` shape (opId, projectId, sceneId, expectedVersion, timestamp)

### State Machine (`packages/app/src/store/`)

- **graph-machine.ts** — XState state machine, separate from the scene machine:
  - Context: nodes, edges, selectedNodeIds, selectedEdgeIds, undo/redo stacks
  - Events: ADD_NODE, REMOVE_NODE, MOVE_NODE, UPDATE_NODE, ADD_EDGE, REMOVE_EDGE, SELECT_NODES, SELECT_EDGES, CLEAR_SELECTION, SNAPSHOT, UNDO, REDO
  - Auto-snapshot on mutations; MAX_HISTORY = 100
  - Cascade edge deletion when removing nodes

- **graph-context.ts** — React context provider with hooks:
  - `useGraph()` → `{ state, send }`
  - `useGraphCanUndo()`, `useGraphCanRedo()`

- **graph-scene-bridge.ts** — Sync between graph and scene:
  - Sprite-type graph nodes create/remove/update sprites in the scene machine
  - Graph layout position (x, y) is independent from sprite scene position (sceneX, sceneY)
  - Generates placeholder images for new sprite nodes

### Tests

- `packages/schemas/src/__tests__/graph.test.ts` — schema validation (20 tests)
- `packages/schemas/src/__tests__/graph-ops.test.ts` — op validation (8 tests)
- `packages/app/src/store/__tests__/graph-machine.test.ts` — state machine (24 tests)

---

## Phase 2: Node Graph Panel

Added a full graph editor panel to Dockview alongside the existing canvas.

### Graph Editor (`packages/app/src/graph/`)

- **graph-panel.tsx** — Dockview panel wrapper rendering `GraphCanvas`
- **graph-canvas.tsx** — Main graph editor (~535 lines):
  - Pan/zoom via CSS transforms and wheel events (Ctrl+wheel = zoom at point, regular wheel = pan)
  - Node rendering from GraphContext state; edge rendering as SVG overlay
  - Drag-to-move nodes with SNAPSHOT for undo
  - Click-to-connect: output port → drag line → input port, with type compatibility + cycle detection
  - Context menu (right-click) for adding nodes
  - Ctrl+K opens node search palette
  - File drop zone: auto-detects file type → creates appropriate node
  - Status bar showing node/edge count and zoom level
- **graph-node.tsx** — Individual node component:
  - Color-coded header by type, node name display
  - Port dots (inputs left, outputs right) with data-type colors and tooltips
  - NodeContent dispatch to type-specific renderers
  - Selection highlight (blue border)
- **graph-edge.tsx** — Bezier curve edges:
  - SVG paths with smooth S-curves (40% control point offset)
  - Port position estimation from node geometry
  - Click-to-select with color from source port type
  - `PendingEdge` component for live connection preview
- **graph-camera.ts** — Camera math:
  - `getGraphCamera()`, `setGraphCamera()` with zoom clamping (0.1x–5x)
  - `graphScreenToWorld()`, `graphWorldToScreen()`, `graphZoomAtPoint()`
- **graph-interaction-machine.ts** — Separate XState machine for interactions:
  - States: idle, draggingNode, connecting, panning, boxSelecting
  - Singleton `graphInteractionActor` for imperative state queries

### Layout Change

- **app.tsx** — Registered `GraphEditorPanel` in Dockview. Default layout: Sprites (15%) | Canvas (35%) | Graph (35%) | Inspector (15%)

### Tests

- `packages/app/src/graph/__tests__/graph-camera.test.ts` — 10 tests
- `packages/app/src/graph/__tests__/graph-interaction-machine.test.ts` — 8 tests

---

## Phase 3: Core Node Types

Implemented all node types with content renderers, a creation factory, and color coding.

### Node Factory (`packages/app/src/graph/node-factory.ts`)

- `createGraphNode(type, options)` — creates fully initialized graph nodes with default ports, dimensions, and data
- `NODE_DEFAULTS` — width, height, default name per type
- `getDefaultNodeData()` — type-specific initial data:
  - sprite: tint color, scene position
  - shader: GLSL code template
  - code: TypeScript update function template
  - audio: volume, pitch, loop
  - math: operation ("add"), etc.
- `evaluateMathOp()` — 12 math operations (add, subtract, multiply, divide, lerp, clamp, min, max, abs, sin, cos, random)
- `MATH_OPERATIONS` — exported list with labels and input counts

### Port Colors (`packages/app/src/graph/port-colors.ts`)

- `PORT_COLORS` — hex color per data type (texture=blue, float=green, trigger=red, etc.)
- `NODE_TYPE_COLORS` — header color per node type
- `getPortColor()`, `getNodeColor()` with fallback

### Node Content (`packages/app/src/graph/node-content/`)

12 type-specific renderers, each in its own file:

| Component | Node Type | Features |
|-----------|-----------|----------|
| `sprite-content.tsx` | sprite | Tint swatch, filename, dimensions |
| `shader-content.tsx` | shader | Editable code textarea, language indicator, line count |
| `code-content.tsx` | code | Editable TypeScript textarea, language indicator |
| `audio-content.tsx` | audio | Waveform visualization (24 sine bars), volume %, loop indicator |
| `video-content.tsx` | video | Thumbnail placeholder, playback rate, loop indicator |
| `text-content.tsx` | text | Editable textarea for text content |
| `material-content.tsx` | material | Minimal read-only preview |
| `math-content.tsx` | math | Dropdown for operation selection |
| `group-content.tsx` | group | Empty (organizational container) |
| `index.tsx` | — | Switch dispatcher routing to correct component |

### Tests

- `packages/app/src/graph/__tests__/node-factory.test.ts` — 33 tests (creation, defaults, ports, math ops)
- `packages/app/src/graph/__tests__/port-colors.test.ts` — 4 tests

---

## Phase 4: Connection Engine

Made edges functional with data flow between nodes.

### Evaluation Engine (`packages/app/src/graph/evaluate.ts`)

- **Topological sort**: `topologicalSort(nodes, edges)` — Kahn's algorithm with DFS cycle path tracing. Returns sorted order or cycle path.
- **Cycle prevention**: `wouldCreateCycle(nodes, edges, sourceId, targetId)` — BFS reachability check. Integrated into graph-canvas.tsx connection flow.
- **Graph evaluation**: `evaluateGraph(nodes, edges)` — full pull-based evaluation in topological order:
  - Each node resolves inputs from connected outputs
  - Type-specific evaluation: sprite outputs texture/entity, shader compiles uniforms, math computes result, etc.
  - Returns `EvalResult` with outputs, errors, and evaluation order
- **Partial evaluation**: `evaluatePartial(nodes, edges, dirtyNodeIds, cachedOutputs)` — re-evaluates only the dirty subgraph, reusing cached outputs for clean nodes
- **Dirty tracking**: `getDirtySubgraph(dirtyNodeIds, nodes, edges)` — BFS forward propagation to find all downstream nodes needing re-evaluation

### Tests

- `packages/app/src/graph/__tests__/evaluate.test.ts` — 34 tests covering sort, cycles, evaluation, dirty tracking, partial eval

---

## Phase 5: UI Polish

Added unified inspector, minimap, and command palette.

### Unified Inspector (`packages/app/src/panels/graph-inspector.tsx`)

- Detects graph selection before falling through to sprite inspector
- **Node selected**: type header with color, editable name, position fields, port list with connection status, delete button
- **Edge selected**: source → target display, port names and types, delete button
- **Multi-select**: shows count + list of selected nodes

### Minimap (`packages/app/src/graph/graph-minimap.tsx`)

- 160×100px SVG overview in bottom-right of graph panel
- Color-coded node rectangles, auto-scaled to fit all nodes
- Viewport indicator rectangle showing current camera view
- Click to navigate camera to that location

### Node Search (`packages/app/src/graph/node-search.tsx`)

- Opens with Ctrl+K; auto-focused text input
- Fuzzy matching across node label, type, and keywords (substring + character-by-character)
- Arrow key navigation, Enter to create, Escape to close
- Color dot indicators per node type

### Tests

- `packages/app/src/graph/__tests__/node-search.test.ts` — 8 fuzzy match tests
- `packages/app/src/panels/__tests__/graph-inspector.test.ts` — 5 inspector logic tests

---

## Phase 6: AI Agent Upgrades

Added a graph specialist agent with tools, delegation from core agent, and an op dispatcher.

### Graph Agent (`packages/api/src/agents/graph/`)

- **agent.ts** — Specialist agent using `claude-sonnet-4-6`:
  - System prompt with node types, port types, connection rules, layout tips
  - `streamText()` with `stepCountIs(8)` limit
  - Returns assistantText, proposedOps (GraphOp[]), messages

- **tools.ts** — 7 graph manipulation tools:
  - `list_graph` — returns all nodes and edges for context
  - `create_graph_node` — creates any of 12 node types with default ports/data
  - `delete_graph_node` — removes node with cascade flag
  - `connect_nodes` — wires ports with type compatibility + direction validation
  - `disconnect_nodes` — removes edge by ID
  - `update_node_data` — patches node data fields
  - `move_graph_node` — repositions node
  - All tools push ops to shared array with project/scene metadata

### Op Dispatcher (`packages/app/src/chat/apply-graph-ops.ts`)

- `applyGraphOpsToGraph(ops, send)` — translates GraphOps to graph machine events:
  - create_graph_node → ADD_NODE
  - delete_graph_node → REMOVE_NODE
  - move_graph_node → MOVE_NODE
  - update_graph_node_data → UPDATE_NODE
  - create_edge → ADD_EDGE
  - delete_edge → REMOVE_EDGE
- `isGraphOp(op)` — type guard to separate graph ops from scene ops

### Core Agent Integration

- **core/tools.ts** — Added `delegate_to_graph_agent` tool following existing delegation pattern
- **core/agent.ts** — Updated system prompt with graph agent context
- **db/schemas/agent.ts** — Added `"graph"` to agent kind enum

### Tests

- `packages/api/src/agents/graph/__tests__/tools.test.ts` — 9 tests
- `packages/app/src/chat/__tests__/apply-graph-ops.test.ts` — 9 tests

---

## Phase 7: Execution & Runtime

Added event nodes, play mode, script sandbox, and runtime loop.

### Event Nodes

3 new event node types that fire during play mode:

- **on_start** — fires trigger once when play begins. Output: `trigger`.
- **on_update** — fires every frame. Outputs: `trigger`, `float` (delta time).
- **on_input** — fires on key press. Outputs: `trigger`, `string` (key name). Configurable `listenKeys` array.

### Runtime System (`packages/app/src/runtime/`)

- **runtime-machine.ts** — XState machine: `stopped → playing → paused`. Tracks elapsed time, frame count. Events: PLAY, PAUSE, RESUME, STOP, TICK.
- **script-sandbox.ts** — Compiles code node scripts via `new Function()`. Scripts receive `dt`, `time`, `input`, `console.log`. Define `update(dt)` to return output. Compile/runtime errors caught gracefully.
- **runtime-loop.ts** — `requestAnimationFrame` game loop. Each frame: injects runtime data into event nodes, evaluates full graph, executes code nodes with resolved inputs. Manages pressed keys and script compile cache.

### Play Controls

- **play-controls.tsx** — Play/Pause/Stop buttons with live FPS counter
- Added to bottom toolbar alongside edit tools

### Files Changed

| File | Change |
|------|--------|
| `packages/schemas/src/graph.ts` | Added event types to schema + default ports |
| `packages/app/src/graph/node-factory.ts` | Event node defaults (sizes, names, data) |
| `packages/app/src/graph/evaluate.ts` | Event node evaluation (trigger/dt/key outputs) |
| `packages/app/src/graph/node-search.tsx` | Event node entries with keywords |
| `packages/app/src/graph/graph-canvas.tsx` | Event types in context menu |
| `packages/app/src/graph/port-colors.ts` | Event node colors (red, amber, purple) |
| `packages/app/src/graph/node-content/index.tsx` | Event content component cases |
| `packages/app/src/toolbar/bottom-toolbar.tsx` | PlayControls added |
| `packages/api/src/agents/graph/tools.ts` | Event types in create_graph_node tool |

### Files Created

| File | Purpose |
|------|---------|
| `packages/app/src/graph/node-content/on-start-content.tsx` | "Fires once when play mode starts" |
| `packages/app/src/graph/node-content/on-update-content.tsx` | "Fires every frame with delta time" |
| `packages/app/src/graph/node-content/on-input-content.tsx` | Key press indicator + key badges |
| `packages/app/src/runtime/runtime-machine.ts` | Play/pause/stop state machine |
| `packages/app/src/runtime/script-sandbox.ts` | Script compilation + sandboxed execution |
| `packages/app/src/runtime/runtime-loop.ts` | rAF game loop with graph evaluation |
| `packages/app/src/toolbar/play-controls.tsx` | Play/Pause/Stop UI with FPS counter |

### Tests

- `packages/app/src/runtime/__tests__/script-sandbox.test.ts` — 7 tests
- `packages/app/src/runtime/__tests__/runtime-machine.test.ts` — 8 tests

---

## Phase 8: Merge Character Flow

Folded the standalone `/character` page into the main editor as a dockable panel.

### What Changed

The character creator was previously a separate full-screen page at `/character` with its own routing. It now lives inside the main Dockview layout as a tab alongside the Inspector panel, accessible without navigating away from the editor.

### Architecture

- `CharacterChatPanel` and `useCharacterChat` are unchanged — session persistence, AI streaming, image generation, sprite sheet extraction all work as before.
- A thin `CharacterPanel` wrapper instantiates the hook and renders the chat panel in a panel-sized container.
- The panel opens in the same panel group as Inspector (via Dockview's `direction: "within"`), so users see tabbed Inspector/Character panels. They can drag the tab anywhere.

### Files Changed

| File | Change |
|------|--------|
| `packages/app/src/app.tsx` | Added `CharacterCreatorPanel`, registered `"character"` in Dockview, added to default layout as tab within Inspector group |
| `packages/app/src/index.tsx` | Removed `/character` route and `Router` wrapper. Entry point renders `<App />` directly |

### Files Created

| File | Purpose |
|------|---------|
| `packages/app/src/character/character-panel.tsx` | Panel wrapper for character chat in Dockview |

### Files Now Unused

| File | Reason |
|------|--------|
| `packages/app/src/character/character-page.tsx` | Replaced by `character-panel.tsx` |
| `packages/app/src/router.tsx` | No routes needed (single-page app) |

---

## Test Summary

187 tests across 14 files, all passing.

| Area | Files | Tests |
|------|-------|-------|
| Graph schemas | 2 | 28 |
| Graph state machine | 1 | 24 |
| Graph camera | 1 | 10 |
| Graph interactions | 1 | 8 |
| Node factory + math | 1 | 33 |
| Port colors | 1 | 4 |
| Evaluation engine | 1 | 34 |
| Node search | 1 | 8 |
| Graph inspector | 1 | 5 |
| Graph agent tools | 1 | 9 |
| Apply graph ops | 1 | 9 |
| Script sandbox | 1 | 7 |
| Runtime machine | 1 | 8 |
| **Total** | **14** | **187** |

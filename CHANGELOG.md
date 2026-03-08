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

## Phase 9: Project Files, Inspector, & Asset Persistence

Replaced the sprite list with a project files panel, made everything editable, added rich node inspection, and made uploaded assets persist for reuse.

### Project Files Panel (`packages/app/src/panels/`)

- **project-files.tsx** — Complete rewrite of the left sidebar:
  - Reads from live XState state machines (`useGraph`, `useScene`) for real-time updates without page refresh
  - `useInlineEdit` custom hook for shared double-click rename logic
  - Tree structure: Scenes → entities, Assets → draggable items, Graph → nodes/edges
  - `EditableProjectName` component in header (double-click to rename)
  - `AssetItem` component: draggable assets with `application/x-dreamer-asset` data transfer for re-adding to graph
  - Expanded asset icons for all types (sprite, audio, video, shader, script, text, font, material)
  - File size display next to each asset

- **project-panel.tsx** — Combines `ProjectSelector` dropdown with `ProjectFiles` below

- **project-selector.tsx** — Dropdown to list/switch/create projects

### Graph Inspector Enhancements (`packages/app/src/panels/graph-inspector.tsx`)

- **Fixed name editing**: Changed from `UPDATE_NODE` (patches `node.data`) to `RENAME_NODE` (updates top-level `name` field)
- **Node dimensions**: Shows width × height below position fields
- **Asset info section**: File name, MIME type, file size (formatted as B/KB/MB) — displayed when node has an attached file
- **Type-specific properties** via `NodeProperties` component:
  - Sprite: tint color swatch, scene position
  - Audio: volume %, pitch, loop
  - Video: playback rate, loop
  - Shader/Code: language, line count
  - Text: character count
  - Material: blend mode
  - Math: operation
  - On Input: listen keys
  - Group: child count

### Graph Machine (`packages/app/src/store/graph-machine.ts`)

- Added `RENAME_NODE` event: `{ type: "RENAME_NODE"; nodeId: string; name: string }` — pushes undo history and updates the top-level `name` field (not `data`)

### Asset Persistence

**Backend** (`packages/api/src/routes/projects.ts`):
- Asset upload now **registers assets** in the project JSON `assets` record with metadata (name, MIME type, size, extension)
- `mimeToAssetType()` helper maps MIME types/extensions to schema asset types
- `GET /:id/assets` — lists all project assets from JSON
- `DELETE /:id/assets/:assetId` — removes asset from JSON and deletes the file from disk

**Frontend** (`packages/app/src/project/api-client.ts`):
- `uploadProjectAsset` now returns `size` and `assetType`
- Added `listProjectAssets()` and `deleteProjectAsset()` methods

### File Drop & Reuse (`packages/app/src/graph/graph-canvas.tsx`)

- Drop handler now stores `fileSize` and `assetId` in node data
- After upload, refreshes project to update sidebar asset list
- Handles `application/x-dreamer-asset` drag from sidebar — dropping an asset creates a new node with all original file info (URI, size, type)
- Media nodes (sprite, audio, video) show actual content: image preview, audio playback with waveform, embedded video player

### Node Content Renderers

- **sprite-content.tsx** — Shows actual image when `data.uri` exists, falls back to tint color swatch
- **audio-content.tsx** — Full playback: Play/Pause/Stop buttons, progress bar over waveform, time display
- **video-content.tsx** — Embedded `<video>` with hover play/pause overlay

### Project & Scene Naming

- Backend: `PATCH /project/:id` (rename project), `PATCH /project/:id/scenes/:sceneId` (rename scene)
- Frontend: API client methods `renameProject()`, `renameScene()`
- All names editable via double-click in project files panel and inspector

### Files Changed

| File | Change |
|------|--------|
| `packages/app/src/app.tsx` | Replaced `spriteList` panel with `projectFiles` panel |
| `packages/app/src/store/graph-machine.ts` | Added `RENAME_NODE` event |
| `packages/app/src/panels/graph-inspector.tsx` | Fixed name editing, added metadata display |
| `packages/app/src/graph/graph-canvas.tsx` | Asset upload with metadata, sidebar asset drop handling |
| `packages/app/src/graph/node-factory.ts` | Increased node sizes for media content |
| `packages/app/src/graph/node-content/sprite-content.tsx` | Image preview from URI |
| `packages/app/src/graph/node-content/audio-content.tsx` | Full audio playback UI |
| `packages/app/src/graph/node-content/video-content.tsx` | Embedded video player |
| `packages/app/src/graph/node-content/text-content.tsx` | Editable textarea |
| `packages/api/src/routes/projects.ts` | Asset registration, list, delete endpoints; project/scene rename |
| `packages/api/src/db/project-repo.ts` | `listProjects`, `renameProject`, `renameScene` methods |
| `packages/app/src/project/api-client.ts` | New API methods for assets, projects, scenes |
| `packages/app/src/project/project-context.ts` | Added `switchProject` to context |
| `packages/app/src/project/project-loader.tsx` | Support switching projects by ID |

### Files Created

| File | Purpose |
|------|---------|
| `packages/app/src/panels/project-files.tsx` | Project files tree with live state, inline editing, draggable assets |
| `packages/app/src/panels/project-panel.tsx` | Project selector + files panel container |
| `packages/app/src/panels/project-selector.tsx` | Dropdown to list/switch/create projects |

### Node Type Changing

- **Graph machine** (`graph-machine.ts`): Added `CHANGE_NODE_TYPE` event — updates type, ports (via `getDefaultPorts`), dimensions (via `NODE_SIZE` lookup), and removes edges connected to stale ports
  - `removeEdgesWithStalePorts()` helper cleans up incompatible connections
  - Preserves node ID, name, position, and data
- **Inspector** (`graph-inspector.tsx`): Replaced static type label with `<select>` dropdown listing all 12 node types, dispatches `CHANGE_NODE_TYPE` on change

| File | Change |
|------|--------|
| `packages/app/src/store/graph-machine.ts` | Added `CHANGE_NODE_TYPE` event, `NODE_SIZE` table, `removeEdgesWithStalePorts` |
| `packages/app/src/panels/graph-inspector.tsx` | Type selector dropdown in node header |

### Asset Renaming (post Phase 9)

- **Backend**: `PATCH /project/:id/assets/:assetId` — renames an asset's `meta.name` in the project JSON
- **Frontend**: `renameProjectAsset()` API client method
- **UI**: `AssetItem` in project files panel now supports double-click inline rename (uses `useInlineEdit`), with drag disabled during editing

| File | Change |
|------|--------|
| `packages/api/src/routes/projects.ts` | Added `PATCH /:id/assets/:assetId` endpoint |
| `packages/app/src/project/api-client.ts` | Added `renameProjectAsset()` |
| `packages/app/src/panels/project-files.tsx` | `AssetItem` supports inline rename via double-click |

---

## Phase 10: Three.js Viewport

Added a Three.js rendering backend that plays in a dockview panel, connected to the node graph runtime loop via a shared frame bus.

### Architecture

- **Frame bus** (`runtime/frame-bus.ts`): Singleton shared mutable object — the runtime loop writes eval results each tick, the viewport renderer reads them in its own `requestAnimationFrame` loop. Zero React re-renders in the hot path.
- **Dockview context** (`store/dockview-context.ts`): Exposes `useDockviewApi()` hook so any component (e.g. PlayControls) can open/focus panels programmatically.

### Viewport Renderer (`viewport/viewport-renderer.ts`)

- Imperative Three.js module — `WebGLRenderer` + orthographic camera + scene
- **Sprite rendering**: Maintains a mesh pool keyed by node ID. Creates `PlaneGeometry` + `MeshBasicMaterial` for each sprite node. Loads textures from `data.uri` via `TextureLoader` (cached), falls back to tint color.
- **Audio playback**: Web Audio API manager. Fetches and decodes audio buffers (cached), creates `AudioBufferSourceNode` per audio node with volume/pitch/loop support. Stops playback when nodes are removed or runtime stops.
- **Lifecycle**: `mount(container)` / `resize(w, h)` / `unmount()` / `dispose()` — independent of React, survives panel close/reopen.

### Viewport Panel (`viewport/viewport-panel.tsx`)

- React wrapper for dockview panel registration
- Uses `ResizeObserver` to handle dockview panel resizing
- Mounts/disposes the Three.js renderer on lifecycle

### Runtime Integration

- **Runtime loop** (`runtime-loop.ts`): Now publishes `{ evalResult, nodes, time, dt }` to the frame bus after each `evaluateGraph()` call. Clears the bus on stop.
- **Play controls** (`toolbar/play-controls.tsx`): Auto-opens the viewport panel (as a tab alongside Canvas) when Play is pressed. Focuses it if already open.

### App Registration (`app.tsx`)

- Registered `viewport` component in the dockview components map
- Added `DockviewContext.Provider` wrapping the app, storing the API ref from `onReady`

### Files Created

| File | Purpose |
|------|---------|
| `packages/app/src/runtime/frame-bus.ts` | Shared frame data bus (runtime → viewport) |
| `packages/app/src/store/dockview-context.ts` | React context for DockviewApi access |
| `packages/app/src/viewport/viewport-renderer.ts` | Three.js scene, sprite pool, audio manager |
| `packages/app/src/viewport/viewport-panel.tsx` | Dockview panel wrapper with ResizeObserver |

### Files Changed

| File | Change |
|------|--------|
| `packages/app/src/runtime/runtime-loop.ts` | Publishes eval results to frame bus, clears on stop |
| `packages/app/src/toolbar/play-controls.tsx` | Auto-opens viewport panel on Play via dockview API |
| `packages/app/src/app.tsx` | Registered viewport panel, added DockviewContext provider |
| `packages/app/package.json` | Added `three` + `@types/three` dependencies |

### Entity Store & Write-Back (Phase 10b)

Closes the feedback loop: code nodes can now persistently store state across frames and directly manipulate sprite entities in the viewport.

#### Entity Store (`runtime/entity-store.ts`)

- `EntityStore` class holds mutable per-entity state: `x`, `y`, `scaleX`, `scaleY`, `rotation`, `tint`, `visible`, `uri`
- `EntityHandle` class provides read/write access with convenience methods: `setPosition()`, `setScale()`, `translate()`
- `EntitiesApi` exposed to scripts: `entities.get(nameOrId)` returns a handle, `entities.list()` returns all sprite names
- Per-code-node persistent state via `nodeState` map — survives across frames, cleared on Stop
- `init()` bootstraps entities from sprite nodes at runtime start, `sync()` adds/removes entities each frame

#### Script Sandbox (`runtime/script-sandbox.ts`)

Code nodes now receive two new globals:
- **`state`** — persistent `Record<string, unknown>` scoped to this code node. Values survive across frames (e.g., `state.x ??= 0; state.x += speed * dt;`)
- **`entities`** — API to read/write sprite properties at runtime:
  ```js
  const player = entities.get("Player");
  player.x += speed * dt;
  player.tint = "#ff0000";
  player.setScale(2);
  ```

#### Runtime Loop Changes (`runtime/runtime-loop.ts`)

- Creates `EntityStore` instance, calls `init()` on first frame and `sync()` on subsequent frames
- Builds `EntitiesApi` from current sprite nodes (name→id lookup)
- Passes `state` and `entities` to every code node execution
- Clears entity store on stop

#### Viewport Renderer Changes (`viewport/viewport-renderer.ts`)

- Now reads sprite position, scale, rotation, tint, and visibility from the `EntityStore` instead of static node data
- Supports rotation (`mesh.rotation.z`)
- Supports per-axis scale (`scaleX`, `scaleY`)
- Entities hidden with `visible: false` are skipped

#### Frame Bus (`runtime/frame-bus.ts`)

- `FrameSnapshot` now includes `entityStore` reference for the viewport to read

| File | Change |
|------|--------|
| `packages/app/src/runtime/entity-store.ts` | **New** — EntityStore, EntityHandle, EntitiesApi |
| `packages/app/src/runtime/script-sandbox.ts` | Added `state` and `entities` to SandboxApi |
| `packages/app/src/runtime/runtime-loop.ts` | EntityStore lifecycle, passes state/entities to scripts |
| `packages/app/src/runtime/frame-bus.ts` | FrameSnapshot includes entityStore |
| `packages/app/src/viewport/viewport-renderer.ts` | Reads from EntityStore for position/scale/rotation/tint |
| `packages/app/src/runtime/__tests__/script-sandbox.test.ts` | Updated tests with `makeApi()` helper for new fields |

### Pong Demo (Phase 10c)

Default placeholder game that loads when a project has an empty graph. Demonstrates the node graph system working as a game logic layer.

#### Demo Graph (`graph/demo-pong.ts`)

6 nodes + 2 edges forming a complete Pong game:

| Node | Type | Purpose |
|------|------|---------|
| Ball | sprite | 16×16 white square |
| Left Paddle | sprite | 16×80 blue paddle at x=-350 |
| Right Paddle | sprite | 16×80 red paddle at x=350 |
| On Update | on_update | Fires every frame |
| On Input | on_input | Listens for W, S, ArrowUp, ArrowDown |
| Pong Logic | code | Game loop: movement, collision, scoring |

Edges: `On Update → Pong Logic` (trigger), `On Input → Pong Logic` (key data)

The code node uses `state` for persistent ball/paddle positions/velocities and `entities` API to write positions to the viewport each frame.

#### Auto-Load (`project/use-graph-persistence.ts`)

When hydrating an empty graph (zero nodes and edges), `createPongDemo()` is called and its nodes/edges are replayed into the graph machine.

| File | Change |
|------|--------|
| `packages/app/src/graph/demo-pong.ts` | **New** — Pong demo graph factory |
| `packages/app/src/project/use-graph-persistence.ts` | Loads Pong demo for empty graphs |

### Interactive Inspector & Input Fix (Phase 10d)

Made the graph inspector a full property editor — almost every node property is now editable inline.

#### Inspector Editable Properties (`panels/graph-inspector.tsx`)

| Node Type | Editable Properties |
|-----------|-------------------|
| Sprite | Tint (color picker + hex input), scene X/Y position, width/height |
| Audio | Volume (slider 0–100%), pitch (number), loop (checkbox) |
| Video | Playback rate, loop (checkbox) |
| Code | Language (dropdown), full code editor (textarea) |
| Shader | Language (dropdown), full code editor (textarea) |
| Text | Content (textarea), character count |
| Math | Operation (dropdown with all 12 ops) |
| Material | Blend mode (dropdown: normal/additive/multiply/screen) |
| On Input | Key binding editor: shows key badges, "Add key" button captures next keypress, click × to remove |

#### Key Binding Editor

New `KeyBindingEditor` component for `on_input` nodes:
- Displays current keys as removable badges
- "Add key" enters listening mode — captures the next keypress and adds it
- Press Escape to cancel listening
- Dispatches `UPDATE_NODE` with updated `listenKeys` array

#### Input Bug Fix

Two bugs prevented keyboard input from reaching code nodes during gameplay:

1. **Code node input resolution** (`graph/evaluate.ts`): The `evaluateNode` for `code` type didn't include resolved inputs in its output. The runtime passed `evalResult.outputs[nodeId]` as script input, but that only contained the code node's own outputs (`trigger_out`, `data_out`), not the resolved upstream inputs (`trigger_in`, `data_in`). Fixed by merging resolved inputs into the code node's output map.

2. **Stale node data in tick** (`runtime/runtime-loop.ts`): The runtime called `getGraph()` before `updateNodeData()`, so the `nodes` object used for evaluation had stale `_pressed`/`_key` values. The state machine update via `send()` produces a new state object that isn't reflected in the already-captured reference. Fixed by directly patching `node.data` in-place alongside the state machine update.

3. **Arrow key scroll prevention**: Added `e.preventDefault()` for arrow keys in the runtime keydown handler to prevent the browser from scrolling the page during gameplay.

| File | Change |
|------|--------|
| `packages/app/src/panels/graph-inspector.tsx` | Full rewrite of `NodeProperties` — all properties editable with color pickers, sliders, dropdowns, textareas, key capture |
| `packages/app/src/graph/evaluate.ts` | Code node evaluation includes resolved inputs in output map |
| `packages/app/src/runtime/runtime-loop.ts` | Direct node.data patching for immediate evaluation, arrow key preventDefault |

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

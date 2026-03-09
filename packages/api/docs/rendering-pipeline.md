# Dreamer Rendering Pipeline

The real-time, multi-threaded pipeline that takes a node graph and produces a playable game at 60 FPS.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Graph State │────▶│  Runtime Loop    │────▶│  Frame Bus    │
│  (XState)    │     │  (Main Thread)   │     │  (Lock-Free)  │
└──────────────┘     └────────┬─────────┘     └───────┬───────┘
                              │                       │
                     ┌────────▼─────────┐    ┌────────▼────────┐
                     │  Script Worker   │    │  Viewport       │
                     │  (Web Worker)    │    │  (Three.js)     │
                     └──────────────────┘    └─────────────────┘
```

Three independent loops running concurrently:
1. **Runtime Loop** (main thread, `requestAnimationFrame`): Evaluates graph, dispatches scripts
2. **Script Worker** (Web Worker): Compiles and executes user scripts off-thread
3. **Viewport Renderer** (main thread, separate `requestAnimationFrame`): Three.js rendering + audio

They communicate through the **Frame Bus** — a lock-free mutable snapshot.

---

## Per-Frame Sequence

```
                FRAME N                              FRAME N+1
┌────────────────────────────────────┐  ┌──────────────────────────────┐
│ 1. Apply worker results (N-1)     │  │ 1. Apply worker results (N)  │
│ 2. Inject event node data         │  │ ...                          │
│ 3. Dirty tracking                 │  │                              │
│ 4. Sprite reachability            │  │                              │
│ 5. Entity sync                    │  │                              │
│ 6. Graph evaluation               │  │                              │
│ 7. Publish to frame bus ──────────┼──┼──▶ Renderer reads snapshot   │
│ 8. Dispatch scripts to worker ────┼──┼──▶ Worker executes           │
│ 9. onFrame callback (FPS, logs)   │  │                              │
│ 10. requestAnimationFrame(tick)   │  │                              │
└────────────────────────────────────┘  └──────────────────────────────┘
```

Scripts always run **one frame behind** — results from frame N are applied at the start of frame N+1. This keeps the main thread non-blocking.

---

## Step 1: Apply Worker Results

At the start of each frame, process results from the previous frame's script execution:

- **Entity mutations**: Update `EntityStore` positions, scales, rotations, tints, visibility
- **Node state**: Persist updated `state` objects for each script node
- **Logs**: Collect `console.log()` calls for the runtime console

---

## Step 2: Event Node Injection

Event nodes have their `data` mutated in-place with runtime values:

| Node Type | Injected Fields |
|-----------|----------------|
| `on_start` | `_triggered: boolean` (true only on first frame) |
| `on_update` | `_dt: number` (delta time in seconds) |
| `on_input` | `_pressed: boolean`, `_key: string` |
| `input_map` | `_actionStates: Record<string, boolean>` |

---

## Step 3: Dirty Tracking

Determines which nodes need re-evaluation:

- **Event nodes** (`on_start`, `on_update`, `on_input`, `input_map`): Always dirty
- **Other nodes**: Dirty if `JSON.stringify(node.data)` hash changed since last frame
- **First frame**: Full evaluation (all nodes dirty)
- **Subsequent frames**: Partial evaluation (only dirty nodes + downstream dependents)

---

## Step 4: Sprite Reachability

Determines which sprites are visible:

```
getReachableSpriteIds(nodes, edges) → Set<string>
```

- **No output nodes**: All sprites render (Godot-style default)
- **Output nodes present**: Backward BFS from output nodes through edges to find reachable sprites
- Only reachable sprites are synced to EntityStore and rendered

---

## Step 5: Entity Sync

`EntityStore` maintains mutable runtime state for each active sprite:

```typescript
type EntityState = {
  x: number              // Scene X position
  y: number              // Scene Y position
  scaleX: number         // Horizontal scale (default 1)
  scaleY: number         // Vertical scale (default 1)
  rotation: number       // Radians
  tint: string           // Hex color
  visible: boolean       // Visibility flag
  uri: string | null     // Texture URI (null = solid color)
}
```

**Initialization** (from sprite node data):
- `x, y` ← `node.data.sceneX, sceneY` (default 0)
- `tint` ← `node.data.tint` (default `"#4a9eff"`)
- `uri` ← `node.data.uri` (default null)
- `scaleX, scaleY` ← 1, `rotation` ← 0, `visible` ← true

**Sync behavior:**
- First frame: `entityStore.init(nodes, allowedSpriteIds)` — create all entities
- Subsequent: `entityStore.sync(nodes, allowedSpriteIds)` — add new sprites, remove stale ones

---

## Step 6: Graph Evaluation

### Topological Sort

Kahn's algorithm orders nodes from sources (no inputs) to sinks (no outputs). Cycles are detected and reported as errors.

```typescript
topologicalSort(nodes, edges): { ok: true; order: string[] } | { ok: false; cycle: string[] }
```

### Full Evaluation

```typescript
evaluateGraph(nodes, edges): EvalResult
```

For each node in topological order:
1. Resolve input port values from connected upstream outputs
2. Evaluate node (type-specific logic)
3. Store output port values

### Partial Evaluation

```typescript
evaluatePartial(nodes, edges, dirtyNodeIds, cachedOutputs): EvalResult
```

Only re-evaluates dirty nodes and their downstream dependents. Clean nodes reuse cached outputs from the previous frame.

### Per-Node Evaluation

Each node type produces specific outputs:

| Node | Output Ports | Value |
|------|-------------|-------|
| `sprite` | `texture_out`, `entity_out` | Sprite visual data, entity reference |
| `shader` | `shader_out` | Shader object with code + uniforms |
| `code` | `trigger_out`, `data_out` | Trigger signal + script return values |
| `audio` | `audio_out`, `on_complete` | Audio config, completion trigger |
| `video` | `texture_out`, `audio_out` | Video frame, audio stream |
| `text` | `string_out` | String content |
| `material` | `material_out` | Combined texture + shader |
| `math` | `result_out` | Arithmetic result |
| `on_start` | `trigger_out` | true (first frame only) |
| `on_update` | `trigger_out`, `dt_out` | true, delta time |
| `on_input` | `trigger_out`, `key_out` | key pressed?, which key |
| `input_map` | `actions_out` | `Record<action, boolean>` |
| `composer` | `scene_out` | Collected entity references |
| `output` | (none) | Sink node |

### EvalResult

```typescript
{
  outputs: Record<string, Record<string, PortValue>>  // [nodeId][portId]
  errors: EvalError[]
  order: string[]                                       // Evaluation order
}
```

---

## Step 7: Frame Bus

Lock-free data passing between runtime loop and renderer:

```typescript
class RuntimeFrameBus {
  current: FrameSnapshot | null = null
  playing: boolean = false

  publish(snapshot) { this.current = snapshot; this.playing = true }
  clear()           { this.current = null; this.playing = false }
}
```

**FrameSnapshot:**
```typescript
{
  evalResult: EvalResult
  nodes: Record<string, GraphNode>
  time: number
  dt: number
  entityStore: EntityStore
}
```

No locking, no React state — pure imperative. The renderer may read a slightly stale snapshot, which is acceptable at 60 FPS.

---

## Step 8: Script Dispatch

### Task Collection

For each node with executable code:

1. **Code nodes**: Check `trigger_in` is true, resolve input port values, create task
2. **Sprite inline scripts**: If `node.data.script` exists, create task with `selfEntityName`

### Worker Message Protocol

**Main → Worker:**
```typescript
{
  type: "exec"
  id: number
  tasks: ScriptTask[]
  now: number
}
```

**ScriptTask:**
```typescript
{
  nodeId: string
  code: string
  api: {
    dt: number
    time: number
    input: Record<string, unknown>       // Resolved port values (code nodes)
    state: Record<string, unknown>       // Persistent per-node state
    entities: SerializedEntities         // All sprite entities
    pressedKeys: string[]                // Currently pressed keys
    selfEntityName?: string              // Sprite scripts only
  }
}
```

**Worker → Main:**
```typescript
{
  type: "result"
  id: number
  results: ScriptResult[]
}
```

**ScriptResult:**
```typescript
{
  nodeId: string
  outputs: Record<string, unknown>
  logs: Array<{ nodeId, args, timestamp }>
  entityMutations: Record<string, Partial<EntityState>>
  updatedState: Record<string, unknown>
  error?: string
}
```

### Script Compilation (in Worker)

User code is wrapped in a sandboxed function:

```javascript
"use strict";
return (function(__api) {
  const dt = __api.dt;
  const time = __api.time;
  const input = __api.input;
  const console = __api.console;
  const state = __api.state;
  const entities = __api.entities;
  const Input = __api.Input;
  const self = __api.self;

  // --- USER CODE ---
  ${code}
  // --- END USER CODE ---

  if (typeof update === 'function') {
    update(dt);
  }
})
```

Compiled functions are cached by `nodeId` — recompiled only when code changes.

### Entity Proxies

Each entity exposed to scripts is a **recording proxy**:

```javascript
const proxy = {
  get x() { return local.x },
  set x(v) { local.x = v; mutations[id].x = v },
  // ...setPosition, setScale, translate
}
```

Mutations are collected and sent back to the main thread as `entityMutations`.

---

## Step 9: Viewport Renderer

### Three.js Setup

```typescript
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setClearColor(0x1a1a2e)

const camera = new THREE.OrthographicCamera(
  -400, 400,    // left, right
  300, -300,    // top, bottom
  0.1, 1000     // near, far
)
camera.position.z = 10
```

**Coordinate system:**
- Scene origin: center (0, 0)
- X range: -400 to +400
- Y range: -300 to +300
- Y is flipped: `entity.y` → `-entity.y` in Three.js (positive Y = down in game, up in renderer)

### Batching Strategy

Two-tier **InstancedMesh** system for performance:

#### Solid Batch
- Single `InstancedMesh` for all untextured sprites
- `PlaneGeometry(1, 1)` shared across all instances
- Per-instance color via `InstancedBufferAttribute`
- Max 1024 instances

#### Texture Batches
- One `InstancedMesh` per unique texture URI
- `Map<uri, { mesh, material, count }>`
- Max 1024 instances per texture
- Disposed when count drops to 0
- Textures loaded asynchronously; sprites fall back to solid batch while loading

### Per-Sprite Transform

```typescript
// Entity → Three.js transform matrix
tmpPosition.set(entity.x, -entity.y, 0)           // Flip Y
tmpEuler.set(0, 0, -entity.rotation)               // Negate rotation
tmpQuaternion.setFromEuler(tmpEuler)
tmpScale.set(
  baseWidth * entity.scaleX,
  baseHeight * entity.scaleY,
  1
)
tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale)
batch.mesh.setMatrixAt(index, tmpMatrix)
```

Where `baseWidth` / `baseHeight` come from `node.data.width` / `node.data.height` (default 64).

### Render Loop

```typescript
function tick() {
  const snapshot = frameBus.current
  if (snapshot && frameBus.playing) {
    syncSprites(snapshot)    // Update instance matrices + colors
    syncAudio(snapshot)      // Start/stop/update audio nodes
  } else if (!frameBus.playing) {
    clearScene()             // Remove all instances
  }
  renderer.render(scene, camera)
  rafId = requestAnimationFrame(tick)
}
```

### Audio Playback

- **Web Audio API** with `AudioContext`
- Audio buffers cached per URI (decoded once via `decodeAudioData`)
- Per audio node: `GainNode` (volume) + `BufferSource` (playback rate, loop)
- Audio sources stopped when their node is no longer in the evaluation graph

---

## React Integration

The viewport renderer is **completely outside React**:

```tsx
function ViewportPanel() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const renderer = createViewportRenderer()
    renderer.mount(containerRef.current!)

    const ro = new ResizeObserver(([entry]) => {
      renderer.resize(entry.contentRect.width, entry.contentRect.height)
    })
    ro.observe(containerRef.current!)

    return () => { ro.disconnect(); renderer.dispose() }
  }, [])

  return <div ref={containerRef} className="w-full h-full" />
}
```

No React state in the hot path. The runtime loop and renderer communicate through the imperative `frameBus`.

### Play Controls

```
[Play] → createRuntimeLoop({ getGraph, onFrame }) → loop.start()
[Pause] → loop.pause()
[Stop] → loop.stop() → frameBus.clear()
```

`getGraph()` reads from a ref to the latest XState graph state, so live edits to node data (e.g., changing a script) take effect on the next frame.

---

## Performance Characteristics

| Aspect | Strategy |
|--------|----------|
| Graph evaluation | Partial eval — only dirty subgraph re-evaluated |
| Script execution | Web Worker — non-blocking, one frame latency |
| Sprite rendering | InstancedMesh batching — single draw call per texture |
| Data passing | Lock-free frame bus — no synchronization overhead |
| Script compilation | Cached by nodeId — recompile only on code change |
| Audio decoding | Cached per URI — decode once |
| Texture loading | Async with solid-color fallback while loading |

---

## File Reference

| File | Purpose |
|------|---------|
| `runtime/runtime-loop.ts` | Main loop: timing, eval, script dispatch |
| `runtime/entity-store.ts` | Sprite state management, entity API |
| `runtime/script-worker.ts` | Worker: compilation, execution, proxies |
| `runtime/frame-bus.ts` | Lock-free snapshot passing |
| `graph/evaluate.ts` | Topological sort, full + partial evaluation |
| `viewport/viewport-renderer.ts` | Three.js renderer, batching, audio |
| `viewport/viewport-panel.tsx` | React mount/resize wrapper |
| `toolbar/play-controls.tsx` | Play/pause/stop UI |

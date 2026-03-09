# Bug Fixes Log

## Bug 1: Graph ops not persisted server-side (HIGH)

**Files:** `packages/api/src/routes/chat.ts`

**Problem:** When the AI agent generated graph ops (create/delete nodes, edges), they were filtered out of `projectRepo.applyOps()` because that function only handles scene ops (`create_entity`, `add_component`, etc.). Graph ops were only persisted via the frontend auto-save roundtrip (`useGraphPersistence` → `saveProjectGraph`). If the frontend failed to receive them (stream error, page refresh mid-stream), the changes were lost.

**Fix:** After `collectResult()`, the chat route now applies graph ops directly to the project file server-side by reading the current project, mutating the graph state (add/remove nodes/edges), and calling `projectRepo.saveGraph()`. This ensures graph changes persist regardless of frontend delivery.

**Ops handled:**
- `create_graph_node` — adds node to `graph.nodes`
- `delete_graph_node` — removes node + cascades edge cleanup
- `move_graph_node` — updates node x/y
- `update_graph_node_data` — patches node data
- `create_edge` — adds edge to `graph.edges`
- `delete_edge` — removes edge

---

## Bug 2: Duplicate graph ops sent to frontend (MEDIUM)

**Files:** `packages/api/src/routes/chat.ts`

**Problem:** Graph ops were sent to the frontend twice:
1. Via the `onNewOps` callback (fires after each agent step during streaming)
2. Via the post-`collectResult()` write (sends ALL graph ops as a reliable delivery path)

The frontend `onData` handler had no deduplication, so each `ADD_NODE` event was dispatched to the XState graph machine twice, polluting the undo history with duplicate snapshots.

**Fix:** The `onNewOps` callback now filters out graph ops — it only streams scene ops. Graph ops are sent exactly once after `collectResult()` completes. This eliminates the duplicate delivery without requiring frontend deduplication logic.

---

## Bug 3: Stuck runs never cleaned up (MEDIUM)

**Files:** `packages/api/src/routes/chat.ts`

**Problem:** The `onError` handler in `createUIMessageStream` called `agentRunRepo.completeRun()` without awaiting or catching errors. If the completion itself failed (e.g., file I/O error), the error was silently swallowed and the run remained in `"running"` status forever. Orphaned runs accumulated in `data/runs/` and polluted thread history.

**Fix:** Added `.catch()` handler to the `completeRun` call in `onError` so failures are logged rather than silently swallowed. The run will still be marked as errored in the normal case, and any secondary failure is visible in logs.

**Note:** A more comprehensive fix would include a startup sweep to mark stale `"running"` runs as `"error"` (e.g., runs older than 10 minutes). This is not yet implemented.

---

## Bug 4: TypeScript error on `value.assetId` (LOW)

**Files:** `packages/api/src/agents/core/tools.ts`

**Problem:** In the `add_component` tool, the `value` object was constructed as:
```typescript
const value = { ...input.value, entityId: input.entityId };
```

Since `input.value` is `Record<string, unknown>`, the spread loses the index signature after the explicit `entityId` property is added. TypeScript narrows the type to `{ entityId: string }`, making `value.assetId` a type error on lines 160/162.

**Fix:** Explicitly typed `value` as `Record<string, unknown>`:
```typescript
const value: Record<string, unknown> = { ...input.value, entityId: input.entityId };
```

---

## Bug 5: Shared port object references in sprite batch (LOW)

**Files:** `packages/api/src/agents/graph/tools.ts`

**Problem:** In `create_sprite_batch`, `getDefaultPorts(type)` was called once before the loop, and the same `ports` array reference was shared across all created nodes. If any downstream code mutated a node's ports (e.g., adding/removing a port), it would corrupt all nodes in the batch.

**Fix:** Clone ports per node in the loop:
```typescript
ports: ports.map((p) => ({ ...p }))
```

Each node now gets its own independent copy of the ports array and port objects.

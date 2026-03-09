# Core Agent Improvements

## Changes Made

### 1. Extracted delegation boilerplate into `makeDelegationTool()`

**File:** `src/agents/core/tools.ts`

**Before:** Three identical delegation tools (`delegate_to_sprite_agent`, `delegate_to_coding_agent`, `delegate_to_graph_agent`) each with ~60 lines of copy-pasted code for creating child runs, executing agents, merging ops, and completing runs.

**After:** Single `makeDelegationTool()` helper that takes the agent name, runner function, and description. Each delegation tool is now a one-liner call to the helper.

**Why:** DRY. Adding a new specialist agent previously required copying 60 lines and changing 3 values. Now it's one function call.

### 2. Added error handling to delegation

**File:** `src/agents/core/tools.ts` — `makeDelegationTool()`

**Before:** If a specialist agent threw an error during execution, the exception propagated up to `streamText`, the child run record stayed stuck in "running" status permanently, and the core agent received an unhandled tool error.

**After:** The delegation helper wraps `runner()` in try/catch. On failure:
- The child run is marked as errored via `agentRunRepo.completeRun({ error })`
- The tool returns `{ error, opsCount: 0 }` so the core agent can recover gracefully
- A secondary `.catch()` prevents the error-marking itself from throwing

### 3. Fixed single ops callback → multiple listeners

**File:** `src/agents/core/agent.ts`

**Before:**
```typescript
let opsCallback: ((newOps: SceneOp[]) => void) | null = null;

function onNewOps(cb) {
  opsCallback = cb;  // silently overwrites previous listener
}
```

Calling `onNewOps()` twice would silently drop the first listener with no warning.

**After:**
```typescript
const opsCallbacks: Array<(newOps: SceneOp[]) => void> = [];

function onNewOps(cb) {
  opsCallbacks.push(cb);
}
```

Multiple consumers can now subscribe. All callbacks fire when new ops are emitted.

### 4. Fixed `create_quick_sprite` stale Y positioning

**File:** `src/agents/core/tools.ts` — `create_quick_sprite` tool

**Before:**
```typescript
y: Object.keys(project.graph?.nodes ?? {}).length * 200 + 60
```

This reads from the stale project snapshot. Creating multiple quick sprites in the same run would stack them all at the same Y position because `project.graph.nodes` never updates during a run.

**After:**
```typescript
y: (Object.keys(project.graph?.nodes ?? {}).length +
    ops.filter(o => o.kind === "create_graph_node").length) * 200 + 60
```

Now counts both existing graph nodes AND queued `create_graph_node` ops, so successive sprites in the same run get distinct Y positions.

### 5. Removed duplicate Script API from core agent prompt

**File:** `src/agents/core/agent.ts`

**Before:** The core agent's system prompt included a full "Script API" section documenting `self`, `dt`, `time`, `state`, `entities`, `Input`, etc. — the same API already documented in the graph agent's prompt.

**After:** Removed the Script API section from the core prompt. The core agent is an orchestrator — it doesn't write scripts. It delegates to the graph agent, which has the complete Script API reference in its own prompt.

**Why:** The core agent doesn't need to know the script API details. Including it wastes prompt tokens and creates a maintenance burden (two places to update when the API changes). The graph agent has the authoritative reference.

---

## Remaining Issues (Not Addressed)

These are architectural concerns noted during review but not changed in this pass:

### Stale project data across delegation
All specialists receive the same `project` snapshot from request time. If the core agent creates entities then delegates to the graph agent, the graph agent sees the original state. A full fix would require re-reading the project between delegation calls or passing ops as context.

### Mixed op types in one array
`ops: SceneOp[]` holds both scene ops and graph ops (cast via `as unknown as SceneOp`). The route filters them apart using `GRAPH_OP_KINDS`. A cleaner approach would use separate arrays or a discriminated union wrapper, but this is a larger refactor affecting the route, agent types, and frontend.

### Model selection
The core orchestrator uses Haiku (fast, cheaper) while making high-level game design decisions. The graph agent also uses Haiku for mechanical node creation. An argument could be made that the orchestrator needs the strongest model for planning, while leaf specialists doing templated work could use the cheaper one. This is a product decision, not a code fix.

### No context passed to specialists
Child agents only receive the `task` string. They don't see conversation history or the parent's broader plan. This limits their ability to make contextually appropriate decisions. Adding a `parentContext` field to `AgentContext` would help but increases token usage.

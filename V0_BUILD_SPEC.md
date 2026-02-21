## v0 Build Spec (JSON-First)
### AI-Native 2D Scene Editor with Scene Graph + Lightweight ECS

This is the implementation spec we should follow while iterating quickly.

## Implementation TODO

- [x] Normalize op discriminant to `kind` in Zod schemas
- [x] Add project JSON repository (`projects/{projectId}.json`)
- [x] Implement deterministic op applier + core validation
- [x] Add `GET /project/:id`
- [x] Add `POST /project/:id/ops`
- [x] Add `POST /agent/run` with required top-level `sessionId`
- [x] Persist run artifacts (`run` record + proposed/applied ops)
- [x] Wire API server to new routes
- [x] Keep existing app/API typecheck passing
- [x] Document remaining gaps for next PR (frontend migration, real LLM op planning)

## Implementation TODO (Phase 2)

- [x] Add project bootstrap endpoint (`POST /project`) that writes initial JSON
- [x] Add idempotent "get or create project" repo helper for rapid iteration
- [x] Document bootstrap API usage in this spec
- [x] Keep app/API typecheck passing after bootstrap work

## 1. Product Shape

You are building:

- A structured **scene graph editor**
- Backed by a **lightweight ECS data model**
- With an AI agent that performs **validated ops**, not arbitrary mutations

Not building yet:

- Prefab/blueprint authoring system
- Plugin-defined systems
- Multiplayer collaboration
- Full export pipeline

## 2. Canonical Hierarchy

```txt
Project (top-level)
├── Scenes[1..N]
│   ├── Scene settings
│   ├── Entity graph (parent/child hierarchy, ordered)
│   └── Components (normalized ECS tables keyed by entityId)
├── Assets (project-scoped)
└── Thread (exactly 1 per project)
    └── Runs[0..N] (each run has required top-level sessionId)
```

## 3. Modeling Rules

- `Entity` is an **instantiation** (concrete scene node), not a blueprint.
- Scene graph handles hierarchy and ordering.
- ECS components hold behavior/render/physics data.
- Runtime is derived from canonical scene+components.
- All mutations are op-driven and version-checked.

## 4. Existing ECS Foundation (already added)

Reference module:

- `packages/app/src/ecs/core.ts`
- `packages/app/src/ecs/bucket.ts`
- `packages/app/src/ecs/index.ts`

Current intent:

- `World` + `Query` power lightweight runtime iteration
- `Bucket` provides deterministic ordered indexing
- Keep runtime simple (no archetype complexity for v0)

## 5. Data Contracts (Zod-first)

Defined in:

- `packages/api/src/db/schemas.ts`

Includes:

- `projectFileSchema`
- `sceneSchema`
- `entitySchema`
- normalized component schemas
- asset schema
- op union schema
- run/thread schemas
- `agentRunRequestSchema` with required `sessionId`

## 6. Discriminated Union Standard

Use `kind` consistently for persisted/API discriminated unions.

- Ops must be discriminated by `kind`
- Message content already uses `kind`
- Any new boundary union should use `kind`

(Internal libs can keep `type` where required, with adapters at boundaries.)

## 7. Behavior Model: Where Systems Live

Critical decision:

- **Systems live in engine code**, not in project JSON.
- Project JSON stores data/config and script assets.
- Agent does not author new core systems in v0.

Built-in systems (runtime order, v0):

1. `transformSystem`
2. `physicsSystem`
3. `scriptSystem`
4. `cameraSystem`
5. `renderSystem`

## 8. How Agent Adds Behavior

Agent behavior path:

- Create/patch `script` assets (`create_asset`, `patch_script`)
- Attach `ScriptComponent` to entities (`add_component`)
- Configure variables (`update_component`)
- Add supporting components as needed (`PhysicsBody`, etc.)

Runtime script hooks:

- `onStart`
- `onUpdate`
- `onCollision`

Script sandbox constraints:

- Allowed: engine API only
- Forbidden: scene graph structural mutation, unrestricted global access

## 9. Ops (Only Mutation Path)

Allowed ops (discriminated by `kind`):

- `create_entity`
- `delete_entity`
- `reparent_entity`
- `reorder_children`
- `update_transform`
- `add_component`
- `update_component`
- `remove_component`
- `create_asset`
- `update_scene_settings`
- `patch_script`

All ops include:

- `opId`
- `projectId`
- `sceneId`
- `expectedVersion`
- `timestamp`
- `payload`

## 10. API (v0)

1. `GET /project/:id`
- Return canonical project JSON.

2. `POST /project`
- Create new project JSON file.
- Body (all optional): `{ id?: string, name?: string, ensure?: boolean }`
- If `ensure: true`, behaves as get-or-create when `id` is provided.

3. `POST /project/:id/ops`
- Input: `{ expectedVersion, ops }`
- Validate and apply atomically.

4. `POST /agent/run`
- Input includes required top-level:
  - `projectId`
  - `sceneId`
  - `threadId`
  - `sessionId` (required, non-null)
  - `prompt`
  - `expectedVersion`

## 11. Persistence (JSON files for now)

```txt
data/
  projects/{projectId}.json
  threads/{threadId}.json
  runs/{runId}.json
```

- One thread per project
- Many runs per thread
- Every run persists `sessionId`

Bootstrap example:

```bash
curl -X POST http://localhost:4111/project \\
  -H 'content-type: application/json' \\
  -d '{"name":"Dreamer Sandbox"}'
```

## 12. Validation Rules (Server)

Reject:

- Cyclical parenting
- Cross-scene parent/child links
- Duplicate IDs
- Missing asset/entity references
- Invalid component payloads
- Illegal script patch shape
- Version mismatch

## 13. Runtime Separation

- `Play` compiles active scene into runtime world
- Runtime state is isolated from canonical editor state
- `Stop` disposes runtime world, returns to editor state untouched

## 14. Frontend Integration Plan

1. Move from sprite-command bridge to op applier.
2. UI edits create ops -> server validate/apply -> client applies server-approved ops.
3. AI edits use `/agent/run` with `sessionId` -> apply returned ops.
4. Keep current Pixi rendering by deriving view from canonical scene/entity/component data during migration.

## 15. Definition of Done (v0)

- Multi-scene project persists/reloads deterministically
- Scene graph reparent/reorder/delete is stable
- Runtime preview executes built-in systems + script hooks
- Agent can add behaviors through script/components
- No unvalidated AI mutation can corrupt canonical state
- Every agent run requires and persists `sessionId`

## Remaining Gaps (Next PR)

- Frontend still uses legacy sprite-command chat flow and does not yet call `/agent/run`.
- Frontend does not yet store/load canonical `ProjectFile` snapshots from `/project/:id`.
- No client op builder exists yet for manual edits (`ADD_SPRITE`, drag, inspector updates still bypass op API).
- `/agent/run` currently uses a scaffolded planner and returns no generated ops (LLM op planning not integrated yet).
- No bootstrap endpoint/CLI exists yet to create initial project JSON files.

# Architecture migration seams

Related execution plan: [Physical Test Scene](./PHYSICAL-SCENE-EXECUTION-PLAN.md)
extends the existing 3D/Rapier layer into a repeatable mechanical test workspace.
It is planned work, including constrained actuators and Arduino sensor feedback.

This document records the currently implemented seams. It intentionally does
not promise a physical Arduino/Scene project split until usage evidence shows
that the shared project envelope is creating measurable friction.

## Board document

`@dreamer/board-domain` is the cross-runtime module for BoardOp semantics.
The browser, API, and CLI may provide adapters around it, but they must not
invent a second mutation implementation.

Its interface owns:

- transactional BoardOp application;
- duplicate and missing entity validation;
- optimistic revision checks when requested;
- immutable input snapshots and one revision increment per batch.

The app's XState machine remains a UI adapter during migration because it also
owns selection, undo history, sensor-obstacle conveniences, and runtime
notifications. It validates AI batches through `board-domain` before dispatch.

## Runtime and persistence state

`board-slice.ts` is the application persistence adapter. `serialOutput` and
`libraryState` are ephemeral runtime/session state. The latter contains
peripheral output, display buffers, and mechanical simulation state, so saving
it would make document persistence depend on the last simulation tick.

`BoardSession` owns dirty-half tracking for BoardState and Graph. The HTTP
repository does not decide whether a document is dirty. The `/project/:id/state`
save path uses the project revision for optimistic conflict detection and
returns the new revision to the browser.

## Component capability seam

The catalog's `ComponentDefinition` remains the implementation used by the
app. `getComponentSpec()` exposes renderer-free core metadata and explicit
capabilities for consumers that do not need React, Three, or simulator
implementation details. Renderers and model registries remain adapters.

## Simulation runtime seam

`SimulationRuntime` owns scheduling and lifecycle only. It uses a browser clock
in production and `ManualSimulationClock` in tests. The existing simulation
loop remains the implementation behind this seam while runner/peripheral
extraction proceeds incrementally.

## Program source migration — execution plan

Status: planned, not implemented. This extends the architecture execution plan
with the migration review decisions. The existing seams above do not yet enforce
these rules.

### Ownership and invariants

`ProjectFile.graph` is an Arduino visual-programming graph, not the circuit
graph. Components and wires belong to the board. The program has exactly one
active source:

```ts
type ProgramSource =
  | { kind: "graph"; graph: ProjectGraph }
  | { kind: "sketch"; code: string };
```

- New projects default to sketch mode; creating a visual program explicitly
  selects graph mode.
- Graph mode exposes generated code as read-only output. It is not an
  independently editable or authoritative persisted field.
- Sketch mode owns editable source text. Graph snapshots retained for recovery
  are inactive and cannot regenerate or overwrite that text.
- Source kind is explicit metadata; code equality, comments, and generated-code
  markers must not decide ownership.
- Compile, simulation, upload, export, preview, and CLI resolve the active source
  through one shared program module. Generation errors block execution with a
  diagnostic rather than falling back to stale code.
- If generated output is cached, validate it against the source revision,
  generator version, and relevant generation inputs before use.

### Legacy migration and compatibility

- Add a versioned project migration. Preserve the original sketch and graph
  losslessly before conversion, including an explicitly empty sketch.
- When a legacy sketch exists, make it the active source and preserve the old
  graph as an inactive recovery snapshot. Equality with generated code is not
  evidence that graph mode was intended.
- Only explicit, validated source metadata may select graph mode automatically.
  A graph-only legacy project without such metadata remains preserved and needs
  an explicit source choice before execution; migration must not silently invent
  runnable code or discard its graph.
- Migration must be deterministic and idempotent. Loading alone must not
  overwrite the original file; persist the migrated representation through the
  normal version-checked save path.
- All old and new mutation routes enter the same program module. Compatibility
  fields are projections, not independently writable sources. Reject conflicting
  new/legacy payloads and return a clear conflict for legacy writes incompatible
  with the active mode; do not silently switch modes.
- Save program edits, mode changes, and recovery snapshots atomically under the
  project revision. Keep a recoverable original until migration is verified.

### Mode switching and code generation

- Graph to sketch: an explicit “Edit generated code” action generates source,
  preserves the graph snapshot, and switches modes in one undoable transaction.
  Generation failure leaves the document unchanged.
- Sketch to graph: do not promise general reverse parsing. Explicitly creating
  or restoring a graph preserves the current sketch for recovery and tells the
  user which program will become active.
- Board-to-sketch generation becomes an explicit “Generate example code” action.
  Automatic initial scaffolding is allowed only for an explicitly pristine new
  program; subsequent component/wire changes cannot overwrite edited code.
- Node layout changes do not change program semantics or overwrite source.
- Hydration, editor preview refresh, and save-time editor flushing must not
  change source kind or write generated previews back as sketch source.

### Ordered implementation slices

1. **Schema and migration:** add `program`, format version, and inactive recovery
   data; implement the legacy rules with fixtures. Keep compatibility readers.
2. **Shared program module:** centralize source resolution, generation,
   validation, and mutations. Route API, Agent, CLI, and compatibility writes
   through it with revision checks. Move code generation to a cross-runtime
   location and keep graph mode gated until all consumers support it.
3. **Consumers and persistence:** connect editor, preview, compile, simulator,
   upload, export, and autosave to the active program. Extend dirty tracking so
   source switches and recovery snapshots save together without racing edits.
4. **Editing behavior:** implement explicit mode switches and undo/redo; replace
   graph-to-`UPDATE_SKETCH` effects and heuristic board auto-generation. Remove
   save-time writes of read-only previews.
5. **Migration verification:** run the acceptance cases below across load, edit,
   save, reload, project switching, and conflicting writes. Enable graph mode
   only after the cross-runtime path passes.
6. **Cleanup:** remove legacy fields only after every reader/writer is migrated
   and recovery is verified. Evaluate a physical `ArduinoDocument`/Scene split
   separately; resolving program ownership does not require that split.

Primary touchpoints: `packages/schemas/src/project.ts`, `arduino.ts`, app
`graph/arduino-codegen.ts`, `store/graph-scene-bridge.ts`, `app.tsx`,
`editor/sketch-editor.tsx`, `simulator/board-to-sketch.ts`, project persistence,
API project routes/repository and Agent operations, and CLI program consumers.

### Acceptance criteria

- Legacy projects with matching or differing sketch/graph retain their exact
  original sketch as active code; both originals remain recoverable. Empty
  sketches, graph-only projects, and repeated migration follow the stated rules.
- Existing sketch-mode projects execute the same source after upgrade and reload.
- Graph editing, node dragging, hydration, saving, and board edits cannot
  overwrite sketch-mode source. Graph-mode previews cannot be edited or flushed
  into authoritative sketch state.
- All execution/export consumers resolve the same source revision. Invalid
  graphs produce diagnostics and never execute cached stale output.
- Mode switching, undo/redo, save/reload, and project switching preserve the
  active source and recovery data. Failed conversion is non-mutating.
- Stale revisions and conflicting compatibility payloads fail without partial
  writes. In-flight saves cannot discard newer edits or clean another project.
- Regression tests cover these behaviors through the shared program interface
  and relevant persistence/UI integration paths; run workspace typechecks and
  the affected app, API, schemas, and CLI tests before removing compatibility.

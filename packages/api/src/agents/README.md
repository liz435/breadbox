# Agent Architecture

This directory contains the full agent pipeline: routing, core agent, planning, reflection, and policy.

## Version Discipline — REQUIRED

**Every time you modify this directory, check whether your change affects the agent flow diagram.**

If yes → bump `version.ts` and add a changelog entry before finishing.

### What requires a version bump

| Change | Bump |
|---|---|
| Routing thresholds (model selection, domain detection, request type keywords) | minor |
| Step limits (`stepCountIs(N)` in core) | minor |
| Tool mode boundaries (build / edit / all) | minor |
| Adding or removing a tool from any mode | minor |
| Stop conditions (sketch recovery max, policy block logic) | minor |
| Post-stream behavior (reflection threshold, replan logic) | minor |
| Structural rewrites — new paths, removed paths | major |
| Prompt wording, token thresholds, compaction params | patch |

### What does NOT require a bump

- Bug fixes that don't change observable branching behavior
- New eval/debug tooling
- Comments, types, test files
- Changes outside `packages/api/src/agents/`

## Snapshot Pinning (Rollback Safety)

Runs can pin a frozen behavior snapshot so prompt/config changes in newer
versions do not alter old behavior.

- Per request: pass `snapshotVersion` in `/api/chat` or `/agent/run`.
- Global default: set env `AGENT_SNAPSHOT_VERSION=<version>`.
- Fallback: if omitted/invalid, runtime uses the current `AGENT_VERSION`.

Each run persists `run.agentSnapshotVersion`, so older runs remain auditable
and reproducible even after future changes.

### How to bump

1. Open `version.ts` — increment `AGENT_VERSION` and add to `SUPPORTED_AGENT_SNAPSHOTS`
2. Prepend a new entry to `AGENT_CHANGELOG` with today's date and a bullet per change
3. Open `core/agent.ts` — freeze the current prompts:
   - Copy the live `COMMON_PROMPT` / `BUILD_PROMPT` / `EDIT_PROMPT` into a new `const PROMPTS_X_Y_Z`
   - Add `"X.Y.Z": PROMPTS_X_Y_Z` to `CORE_PROMPT_SNAPSHOTS`
   - This is the reproducibility guarantee — never edit a frozen const after the fact
4. Open `eval/dashboard.ts` — update the flowchart for the new version:

   **a. Version lists** (3 places — search for the previous version string):
   - `resolveDiagramVersion` — add to the explicit `if` check AND prepend to the `versionAtLeast` fallback chain
   - `changedNodesBetween` — append to the `known` array
   - `allKnownVersions` — append to the `known` array

   **b. `previousDiagramVersion`** — add a new `if (resolved === 'X.Y.Z') return '<previous>';` line at the top

   **c. `introducedNodesForVersion`** — if this version adds new mermaid nodes, return their IDs so the diff view highlights them

   **d. `buildFlowchart`** — if the diagram shape changes (new nodes, removed nodes, changed labels):
   - Add `var isVXYZ = versionAtLeast(resolvedDiagramVersion, 'X.Y.Z');` near the top
   - Add an `if (isVXYZ) { ... }` block before the `if(!agg)` line
   - Inside the block, use `L.filter()` to remove obsolete lines, `L.map()` to update labels, or `L.splice()` to insert new nodes (see the v1.0.1, v1.0.2, v1.1.0 blocks as examples)
   - The flowchart is an array of mermaid `flowchart TD` lines (`var L = [...]`). Each node has an ID (e.g. `DEL`, `CIRC`, `TMB`). Match on IDs to find/replace lines.

   **e. Patch-only bumps** (prompt/threshold changes that don't alter the diagram shape) only need step 4a + 4b — skip 4c/4d.

5. Commit all changed files in the same commit as the behavioral change

```ts
// version.ts — example minor bump
export const AGENT_VERSION = "1.1.0";

export const AGENT_CHANGELOG = [
  {
    version: "1.1.0",
    date: "2026-MM-DD",
    changes: [
      "Increased core max steps from 10 → 12 to handle larger repair tasks.",
    ],
  },
  // ... previous entries below
];
```

---

## Directory Map

```
agents/
  version.ts              ← BUMP THIS when diagram changes
  router.ts               ← domain · requestType · complexity · model · toolMode
  intent-classifier.ts    ← keyword patterns for complexity/domain
  core/
    agent.ts              ← streamText loop, max 10 steps, compaction, plan+reflect
    tools.ts              ← all board + sketch tools; mode filters
  planner.ts              ← async background plan (isDestructive, estimatedToolCalls)
  reflection.ts           ← post-stream confidence check, shouldReplan logic
  policy-engine.ts        ← power budget + routing violation guardrails
  history-summarizer.ts   ← thread compaction for long conversations
  trace.ts                ← lightweight span-based observability
  types.ts                ← shared agent types
```

## Current Baseline (v1.0.0)

| Parameter | Value | Location |
|---|---|---|
| Core max steps | 10 | `core/agent.ts:427` |
| Sketch fix failures | 2 | `core/tools.ts:425` |
| Reflection threshold | confidence < 0.5 | `reflection.ts` |
| Compaction starts | after step 2, keep last 4 | `core/agent.ts:436,440` |
| Sonnet escalation triggers | complex · debug · rebuild · mixed domain · 3+ components · 200+ chars · recent failures | `router.ts:161–192` |

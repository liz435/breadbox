# Agent Architecture

This directory contains the full agent pipeline: routing, core agent, specialists, planning, reflection, and policy.

## Version Discipline — REQUIRED

**Every time you modify this directory, check whether your change affects the agent flow diagram.**

If yes → bump `version.ts` and add a changelog entry before finishing.

### What requires a version bump

| Change | Bump |
|---|---|
| Routing thresholds (model selection, domain detection, request type keywords) | minor |
| Step limits (`stepCountIs(N)` in core / circuit / graph) | minor |
| Tool mode boundaries (build / edit / all / circuit) | minor |
| Adding or removing a tool from any mode | minor |
| New delegation target or delegation limit change | minor |
| Stop conditions (sketch recovery max, policy block logic) | minor |
| Post-stream behavior (reflection threshold, replan logic) | minor |
| Structural rewrites — new agent kind, removed paths | major |
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

1. Open `version.ts`
2. Increment `AGENT_VERSION` (semver: major.minor.patch)
3. Prepend a new entry to `AGENT_CHANGELOG` with today's date and a bullet per change
4. Commit `version.ts` in the same commit as the behavioral change

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
    tools.ts              ← all board + sketch + delegation tools; mode filters
  circuit/
    agent.ts              ← wiring specialist, Sonnet, max 8 steps, 30s timeout
  graph/
    agent.ts              ← graph specialist, Haiku, max 8 steps, 30s timeout
  planner.ts              ← async background plan (isDestructive, estimatedToolCalls)
  reflection.ts           ← post-stream confidence check, shouldReplan logic
  policy-engine.ts        ← power budget + routing violation guardrails
  skills.ts               ← domain-specific wiring/graph guidance injected per run
  history-summarizer.ts   ← thread compaction for long conversations
  trace.ts                ← lightweight span-based observability
  types.ts                ← shared agent types
```

## Current Baseline (v1.0.0)

| Parameter | Value | Location |
|---|---|---|
| Core max steps | 10 | `core/agent.ts:427` |
| Circuit max steps | 8 | `circuit/agent.ts:134` |
| Graph max steps | 8 | `graph/agent.ts:158` |
| Sketch fix failures | 2 | `core/tools.ts:425` |
| Delegation limit | 1 per agent per turn | `core/tools.ts:198` |
| Delegation retries | 2, exponential backoff | `core/tools.ts:221` |
| Reflection threshold | confidence < 0.5 | `reflection.ts` |
| Compaction starts | after step 2, keep last 4 | `core/agent.ts:436,440` |
| Sonnet escalation triggers | complex · debug · rebuild · mixed domain · 3+ components · 200+ chars · recent failures | `router.ts:161–192` |

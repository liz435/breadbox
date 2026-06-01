# Dreamer Docs

Documentation for the current code in this repository. These docs describe how
things are actually built today, not the plans. The plan / roadmap documents
(AGENT_DECISION_TREE, ARDUINO_PLAN, etc.) still live alongside these and cover
where the project is heading.

## Architecture docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — monorepo layout, ports, runtime
  topology, data flow. Start here.
- [`SIMULATION.md`](./SIMULATION.md) — the simulation subsystem. AVR runner,
  SketchRunner contract, peripheral bus, pin-state-store, circuit solver,
  main simulation loop. This is the deepest doc.
- [`AGENT.md`](./AGENT.md) — hardware agent harness: system prompts, tool
  registry, chat transport contract between Elysia and the React app.
- [`BREADBOARD.md`](./BREADBOARD.md) — grid geometry, connectivity rules, net
  resolution, component registry. Read this when adding a new component.
- [`FRONTEND.md`](./FRONTEND.md) — app shell, board state store (XState),
  panels, chat integration.
- [`CLI.md`](./CLI.md) — the `npx dreamer` binary: web UI manifest, API
  spawning, env-var opt-outs.
- [`MCP.md`](./MCP.md) — connecting Claude / Cursor via the `dreamer mcp`
  server: install, the connect commands, the live canvas bridge, tools +
  resources reference.
- [`INTERACTIONS.md`](./INTERACTIONS.md) — cross-system sequences:
  button-press → `digitalRead`, sensor inputs → pin store (and the ordering
  rule), undo/redo vs. agent ops. Read this after the subsystem docs when
  you need to reason about a flow that spans them.

## Plan docs (not tracked by this agent)

- [`AGENT_DECISION_TREE.md`](./AGENT_DECISION_TREE.md)
- [`AGENT_EVAL_PLAN.md`](./AGENT_EVAL_PLAN.md)
- [`ARDUINO_PLAN.md`](./ARDUINO_PLAN.md)
- [`HARDWARE_DEBUG_PLAN.md`](./HARDWARE_DEBUG_PLAN.md)
- [`PLAN.md`](./PLAN.md)
- [`REQUIRMENT.md`](./REQUIRMENT.md)
- [`SHIPPING_BLOCKERS.md`](./SHIPPING_BLOCKERS.md)
- [`VELXIO_ADOPTION_ROADMAP.md`](./VELXIO_ADOPTION_ROADMAP.md)

## Conventions

Repo-wide code conventions (kebab-case filenames, zod-first schemas, Base UI
primitives, no default exports, Tailwind v4, strict TS) are in the root
[`/CLAUDE.md`](../CLAUDE.md). Read that first for style, then the docs above
for what each subsystem actually does.

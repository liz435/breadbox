# Architecture

Breadbox is an Arduino-focused virtual breadboard. The user builds a circuit on
a browser canvas, writes/edits sketch code, and runs it in an in-browser
firmware runner — AVR is the high-fidelity path and RP2040 is currently
best-effort. An LLM agent can place components, connect wires, and write the
sketch.

## Monorepo layout

Bun workspaces at `packages/*`.

```
breadbox/
  packages/
    app/        React 19 + Vite frontend        (dev: port 28420)
    api/        Elysia HTTP server              (dev: port 28421)
    board-domain/ Shared board topology + ops   (used by app and API)
    cli/        `breadbox` binary               (spawns api + serves bundle)
    desktop/    Tauri desktop wrapper           (bundles the CLI sidecar)
    schemas/    Shared zod schemas + types
    config/     Shared TypeScript config + tiny runtime config helper
  docs/         This directory
  scripts/      Build utilities (asset-manifest generator, etc.)
  tsconfig.base.json
```

Each package has its own `package.json` and `tsconfig.json`. Path aliases are
per-package: every package maps `@/*` to its own `src/*`. Cross-package
imports use workspace package names, e.g. `@dreamer/schemas`,
`@dreamer/config`, `@dreamer/api/toolchain`.

Root `package.json` scripts:

- `bun run dev` — starts API + frontend concurrently.
- `bun run dev:app` / `dev:api` — one at a time.
- `bun run typecheck` — typechecks all packages.
- `bun run test` — runs schemas + app + api test suites.
- `bun run build:cli` — builds frontend, regenerates the CLI asset manifest,
  then compiles the CLI binary.

## Runtime topology

```
┌────────────────────────────────┐              ┌────────────────────────────────┐
│  Browser (packages/app)        │              │  Elysia API (packages/api)     │
│                                │              │                                │
│  React tree                    │  /api/chat   │  chat route                    │
│  ├─ BoardContext (XState)      │ ───────────> │   ├─ intent classifier         │
│  │  components, wires, sketch  │  UIMessage   │   ├─ circuit templates (fast)  │
│  ├─ GraphContext, SceneContext │ <─────────── │   └─ streamCoreAgent (AI SDK)  │
│  ├─ Simulation loop (rAF)      │  ops stream  │        ├─ Anthropic provider   │
│  │  ├─ SketchRunner (AVR/RP2040)│              │        └─ 28 tool() defs       │
│  │  ├─ PeripheralBus           │              │                                │
│  │  ├─ PinStateStore           │  /api/compile│  compile route                 │
│  │  └─ CircuitSolver (spicey)  │ ───────────> │   └─ arduino-cli subprocess    │
│  └─ Panels (inspector, serial) │  NDJSON hex  │        (compiles to .hex/.uf2) │
│                                │ <─────────── │                                │
│                                │              │  flash route                   │
│                                │  /api/flash  │   └─ arduino-cli upload        │
│                                │ ───────────> │                                │
└────────────────────────────────┘              └────────────────────────────────┘
                                                          │
                                                          ▼
                                                    [ arduino-cli binary ]
                                                    [ on the host machine ]
```

- **Frontend**: Vite serves React 19. All simulation, rendering, and circuit
  analysis run in the browser. The backend is only consulted for compilation,
  flashing, agent chat, and project persistence.
- **API**: Elysia on port 28421. Hosts the chat endpoint, the arduino-cli
  wrapper (`/api/compile`, `/api/flash`), project CRUD, agent run history, and
  a library auto-install shim. In hosted (`DREAMER_HOSTED=1`) or CLI mode the
  same server also serves the built web UI — see [CLI.md](./CLI.md) and
  `packages/api/src/routes/web-ui-static.ts`.
- **Firmware runners**: [`avr8js`](https://github.com/wokwi/avr8js) runs AVR
  sketches in the browser. `rp2040js` provides a best-effort RP2040 runner;
  without the optional vendored bootrom, PLL- and USB-CDC-dependent behavior is
  limited. There is no backend-side simulation — the API only invokes
  arduino-cli to produce firmware.

## Major subsystems

- **Board state** (`packages/app/src/store/board-machine.ts`, `board-context.ts`)
  An XState actor that owns components, wires, sketch code, library state,
  environment, custom libraries, and the undo/redo stack. Mutations flow in
  through XState events (UI actions, agent ops). See [FRONTEND.md](./FRONTEND.md).

- **Simulation** (`packages/app/src/simulator/*`) — see [SIMULATION.md](./SIMULATION.md).
  - `simulation-loop.ts` — the React hook that drives the rAF tick loop.
  - `runners/` — pluggable SketchRunner backends. `avr-runner.ts` is the
    high-fidelity AVR implementation; `rp2040-runner.ts` is a best-effort
    RP2040 implementation. Other targets are compile-only placeholders.
  - `avr-runner.ts` — raw avr8js wrapper: CPU, GPIO ports B/C/D, timers,
    USART.
  - `avr-compiler.ts` — POSTs to the API's `/api/compile` route and parses
    Intel HEX or UF2 back.
  - `peripherals/peripheral-bus.ts` + siblings — simulated devices that
    watch pin edges and expose state (servos, LCD, ultrasonic, DHT, IR, buzzer).
  - `pin-state-store.ts` — single source of truth for all 20 pin values;
    reactive via `useSyncExternalStore`.
  - `circuit-solver.ts` + `netlist-builder.ts` — SPICE-backed (`spicey` lib)
    electrical analysis of the board for voltage, current, LED brightness,
    reverse polarity, and transient behavior.

- **Breadboard** (`packages/app/src/breadboard/*`) — see [BREADBOARD.md](./BREADBOARD.md).
  Grid geometry, `areConnected` / `resolveNets` connectivity logic, rendering
  (PixiJS-free; bare canvas + DOM overlays).

- **Component registry** (`packages/app/src/components/registry.tsx`) — per-
  component `footprint`, `buildNetlist`, `computeElectricalState`,
  `generateSketch`, `paletteIcon`. Single source of truth for UI + SPICE +
  sketch autogen.

- **Hardware agent** (`packages/api/src/agents/*`) — see [AGENT.md](./AGENT.md).
  AI SDK `streamText` + 28 core `tool()` definitions. Tool calls produce `BoardOp`
  values that the chat route streams to the frontend as `data-scene-ops` parts.

- **CLI** (`packages/cli/*`) — see [CLI.md](./CLI.md). The `breadbox` binary
  spawns an API process and serves an embedded build of the web UI.

## Data flow: user says "blink an LED"

```
1. Browser                │ 2. Elysia /api/chat              │ 3. Frontend apply
─────────────────────────┼──────────────────────────────────┼─────────────────────
useChatMessages          │ streamCoreAgent()                │ onData('scene-ops')
  → POST /api/chat       │   → intent classifier            │   → applyBoardOpsToBoard
  { messages, projectId, │   → if template: fast path       │     (BoardContext.send)
    sceneId, threadId,   │   → else: streamText()           │   → BoardContext fires
    sessionId,           │     with 28 core tools           │     PLACE_COMPONENT,
    expectedVersion }    │     → tool calls produce BoardOp │     CONNECT_WIRE,
                         │     → writer.write(data-scene-ops│     UPDATE_SKETCH
                         │     → projectRepo.applyBoardOps  │   → XState assign()
                         │     → boardTracker.applyOps      │     triggers React
                         │                                  │     rerender
```

Agent-emitted ops are versioned (`expectedVersion`) and server-authoritative.
The repository validates the batch version and every operation's version before
applying anything. On `VersionConflictError` the server rejects the batch
atomically and sends an error part — the client is expected to refresh. See
[INTERACTIONS.md §3](./INTERACTIONS.md#3-undo--redo-vs-agent-ops) for the
client-side undo behavior.

For flows that span the client, the simulation loop, and the API — button
press → `digitalRead`, sensor-inspector → `analogRead`, undo vs. agent
version — see [INTERACTIONS.md](./INTERACTIONS.md).

## Environment variables

- `ANTHROPIC_API_KEY` — required for the agent.
- `DREAMER_HOSTED=1` — tells the API it is also serving the web UI (Railway
  single-container deploy). Enables permissive CORS + the static route.
- `DREAMER_API_ONLY=1` — opt-out: skip the static UI even when `dist/` is
  baked into the image (used for API-only services that share the Docker image).
- `DREAMER_ARDUINO_CLI` — explicit path override for arduino-cli.
- `DREAMER_HOME` — managed install location (binary lives at
  `$DREAMER_HOME/bin/arduino-cli`).
- `DREAMER_AUTO_INSTALL=1` — allow the API to fetch arduino-cli on first run.
- `DREAMER_AUTO_INSTALL_LIBS=0` — disable the "install missing library on
  compile error" retry loop (always off in hosted mode).
- `DREAMER_LOG_FILE=1` / `DREAMER_LOG_LEVEL=info|debug|warn|error`.

See `packages/api/src/toolchain.ts:121` (CLI resolution),
`packages/api/src/libraries.ts:273` (auto-install gate).

## Ports

| Port | Process | Source | When |
| --- | --- | --- | --- |
| 28420 | Vite dev server | `packages/app` | `bun run dev:app` |
| 28421 | Elysia API | `packages/api` | `bun run dev:api` |
| runtime | `breadbox` binary (CLI) static UI | `packages/cli/src/web-ui.ts` | `breadbox headed` |

The frontend learns the API origin via `@dreamer/config`: it reads
`window.__BREADBOX__.apiOrigin` if injected, falls back to the Vite env.

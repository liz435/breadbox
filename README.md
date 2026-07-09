# Breadbox

**An AI-assisted Arduino circuit builder and simulator.** Describe the circuit
you want in plain language; Breadbox wires it on a breadboard, writes the sketch,
and simulates it — AVR and RP2040 — right in the browser. When you're happy,
compile and flash to real hardware.

> Repo: `breadbox` · CLI/app/binary: `dreamer`

## Features

- **Conversational hardware agent** — an LLM agent (Claude, via the Vercel AI
  SDK) that adds components, wires nets, and writes/edits the Arduino sketch.
- **Live breadboard editor** — grid-accurate placement, net resolution, and a
  component registry you can extend.
- **In-browser simulation** — AVR (`avr8js`) and RP2040 (`rp2040js`) runners
  with a peripheral bus, pin-state store, and circuit solver, so inputs
  (buttons, sensors) and outputs (LEDs, servos) behave like the real board.
- **Compile & flash** — drive `arduino-cli` to build the sketch and program a
  connected microcontroller.
- **MCP integration** — connect Claude Desktop or Cursor via `dreamer mcp` and
  build circuits from your existing AI client, with a live canvas bridge.
- **Runs anywhere** — a single-file CLI binary or a native desktop app (Tauri).

## Quickstart

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/liz435/breadbox.git
cd breadbox
bun install
cp .env.example .env        # add your ANTHROPIC_API_KEY
bun run dev                 # frontend (:28420) + API (:28421)
```

Or run the prebuilt CLI without cloning:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/liz435/breadbox/main/scripts/install.sh | bash
dreamer setup               # installs arduino-cli + stores your API key
dreamer                     # interactive session
```

## Monorepo layout

```
packages/
  app/        React 19 + Vite frontend — breadboard canvas, chat, simulation UI
  api/        Elysia API (:28421) — agent harness, project/board/chat routes
  cli/        the `dreamer` single-file binary (serve, headed, run, mcp, …)
  desktop/    Tauri 2 native shell that wraps the CLI binary
  config/     shared configuration
  schemas/    shared zod schemas
```

See [`docs/`](./docs) for the architecture, simulation, agent, breadboard, and
CLI deep-dives — start with [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Desktop app

`packages/desktop` is a Tauri 2 shell that runs the local server and renders the
UI in a native window. From the repo root:

```bash
bun run dev:desktop          # develop
bun run build:desktop        # build installers for the host OS
```

## Development

```bash
bun run dev          # frontend + API
bun run typecheck    # type-check all packages
bun run test         # run the test suites
```

Code conventions (kebab-case filenames, zod-first schemas, Base UI primitives,
Tailwind v4, strict TypeScript, named exports) live in [`CLAUDE.md`](./CLAUDE.md).

## License

[MIT](./LICENSE) © 2026 liz435

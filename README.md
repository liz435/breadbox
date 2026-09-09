# Breadbox

**An AI-assisted Arduino circuit builder, simulator, and physical testbench.**
Describe a circuit in plain language; Breadbox can place parts, wire the board,
write the sketch, and let you inspect it in 2D, 3D, and a physics-enabled
scene before taking it to real hardware.

Breadbox is the product and repository name. Some internal package names and
CLI integrations still use `dreamer`.

## What it does today

- **Conversational circuit building** — an Anthropic-powered agent can add
  components, connect nets, edit Arduino sketches, and propose complete
  circuits.
- **2D breadboard design** — grid-accurate part placement, wire routing, net
  resolution, electrical-rule checks, and schematic generation from the same
  board data.
- **AVR simulation in the browser** — `avr8js`, simulated peripherals, serial
  output, and SPICE-backed DC analysis make common inputs and outputs such as
  buttons, LEDs, sensors, buzzers, and servos interactive.
- **3D and physical testing** — a 3D breadboard view shares the 2D circuit's
  placement and wiring; the Physical Test workspace uses Rapier to exercise
  supported moving parts and scene interactions.
- **Compile and flash** — use `arduino-cli` on the host to compile sketches and
  upload supported boards.
- **MCP and desktop workflows** — use the local CLI/MCP bridge from a supported
  AI client, or run the Tauri desktop shell.

### Target support

| Target | Current support |
| --- | --- |
| Arduino / AVR | In-browser simulation, compile, and supported-board flashing |
| RP2040 | Compile target and UF2 output; best-effort in-browser runner with GPIO/PWM/ADC support |

## Quickstart(Only Desktop app is under active development)

Requires [Bun](https://bun.sh). An Anthropic API key is required only for the
AI agent; the editor and local simulation can otherwise be explored without
one.

```bash
git clone https://github.com/liz435/breadbox.git
cd breadbox
bun install
cp .env.example .env        # optionally add ANTHROPIC_API_KEY
bun run dev                 # app: http://localhost:28420, API: :28421
```

For the local CLI entry point, run it from the repository:

```bash
bun run cli -- help
```

Compilation and flashing additionally require
[arduino-cli](https://arduino.github.io/arduino-cli/). See
[CLI setup](./docs/CLI.md) for CLI, MCP, and toolchain details.

## Desktop app

`packages/desktop` runs the local server and UI in a native Tauri window.

```bash
bun run dev:desktop
bun run build:desktop
```

## Monorepo layout

```
packages/
  app/           React 19 + Vite UI — 2D/3D breadboard, simulation, physical test
  api/           Elysia API — agent harness, projects, compile and flash routes
  board-domain/  shared board graph, topology, electrical rules, and layout logic
  cli/           local CLI and MCP bridge
  desktop/       Tauri 2 native shell
  schemas/       shared Zod schemas and types
  config/        shared configuration and TypeScript settings
docs/            architecture, subsystem guides, and attributions
scripts/         build and asset utilities
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Simulation](./docs/SIMULATION.md)
- [Breadboard and connectivity](./docs/BREADBOARD.md)
- [Agent architecture](./docs/AGENT.md)
- [CLI and MCP](./docs/CLI.md)
- [Asset and dependency attributions](./docs/ATTRIBUTIONS.md)
- [Changelog](./CHANGELOG.md)
- [Release process](./RELEASING.md)


## Development

```bash
bun run dev          # frontend + API
bun run typecheck    # type-check all workspaces
bun run test         # run the test suites
bun run build:cli    # build the embedded-web-UI CLI artifacts
```

Code conventions live in [CLAUDE.md](./CLAUDE.md).

## License

[MIT](./LICENSE) © 2026 liz435

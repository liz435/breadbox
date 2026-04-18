# @dreamer/cli

Command-line interface for Dreamer — Arduino circuit builder. Drives the same agent, tools, compiler, and flasher as the web UI, plus a headed mode that launches the web UI alongside the REPL.

## Install

### Prebuilt binary (recommended once releases are published)

```bash
curl -fsSL https://raw.githubusercontent.com/liz435/dreamer/main/scripts/install.sh | bash
```

Windows:

```powershell
irm https://raw.githubusercontent.com/liz435/dreamer/main/scripts/install.ps1 | iex
```

Both scripts detect your platform, fetch the right binary from the latest GitHub release, verify its SHA256 (if a sidecar `.sha256` is published), and drop `dreamer` onto your PATH.

### From a checked-out repo

```bash
bun run build:cli
./packages/cli/dist/dreamer-darwin-arm64 --version
```

### From source (development)

```bash
bun cli --help
bun cli run "add an LED on pin 13"
```

## First-time setup

```bash
dreamer setup
```

Prompts for:
1. `arduino-cli` install (downloaded to `~/.dreamer/bin/` if missing).
2. Arduino AVR core install (~200MB, required for compile and flash).
3. Anthropic API key (stored at `~/.dreamer/config.json`, chmod 600).
4. Telemetry opt-in (off by default).

Each step can also be done individually — see subcommands below.

## Commands

| Command | Description |
|---|---|
| `dreamer` | Interactive REPL (default) |
| `dreamer run "<prompt>"` | One agent turn, exits when done |
| `dreamer compile` | Compile the current project's sketch via `arduino-cli` |
| `dreamer flash <port>` | Compile and flash to a serial port |
| `dreamer ports` | List connected serial ports |
| `dreamer board` | Print current board summary (components, wires, sketch size) |
| `dreamer sketch` | Print current sketch code |
| `dreamer projects` | List all projects |
| `dreamer scenes` | List scenes in the current project |
| `dreamer headed` | REPL + web UI served on port 3004 |
| `dreamer watch [--port <port>]` | Auto-compile (and optionally flash) on sketch changes |
| `dreamer setup` | Run all first-time setup steps |
| `dreamer config [path\|list\|get\|set\|unset] ...` | Manage configuration |
| `dreamer logs [-f] [<runId>]` | Tail the log file (optionally for a specific run) |
| `dreamer crash [list\|view\|clear] ...` | Inspect crash reports |
| `dreamer telemetry [enable\|disable\|status\|preview]` | Manage opt-in telemetry |
| `dreamer upgrade [--check]` | Check for a new release and update in place |
| `dreamer version` | Print CLI version |
| `dreamer help` | Show usage |

### Global flags

| Flag | Purpose |
|---|---|
| `--project <id>` | Use an existing project instead of creating a new one |
| `--scene <id>` | Pick a specific scene in a multi-scene project |
| `--port <port>` | Serial port for `flash` / `watch` |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |

### REPL slash commands

Inside `dreamer` or `dreamer headed`, the prompt accepts natural-language messages for the agent and the following slash commands:

```
/board                 Print current board state
/sketch                Print current sketch code
/compile               Compile current sketch
/flash <port>          Compile + flash to Arduino
/ports                 List connected serial ports
/project list          List projects
/project load <id>     Load a project
/project new           Create a new project
/scene list            List scenes
/scene switch <id>     Switch active scene
/help                  Show available commands
/quit                  Exit
```

Ctrl+C during agent streaming aborts the run (the background run is marked `failed: aborted by user` in `agent-run-repo`). A second Ctrl+C within 1.5s force-exits.

## Configuration

### File

`~/.dreamer/config.json` (chmod 600 on Unix):

```json
{
  "anthropic": { "apiKey": "sk-ant-..." },
  "telemetry": { "enabled": false, "installId": "<uuid>" },
  "updates":   { "channel": "stable" }
}
```

Manage from the CLI:

```bash
dreamer config set anthropic-key sk-ant-...
dreamer config set updates-channel beta
dreamer config get telemetry
dreamer config list
dreamer config path
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | config file | Overrides the stored API key |
| `DREAMER_HOME` | `~/.dreamer` | Where projects, runs, logs, and config live |
| `DREAMER_MACHINE_HOME` | `~/.dreamer` | Machine-scoped caches (managed `arduino-cli`, etc.) |
| `DREAMER_ARDUINO_CLI` | (resolver) | Absolute path to an `arduino-cli` binary to use |
| `DREAMER_AUTO_INSTALL` | `0` | Set to `1` in non-TTY contexts to skip install prompts |
| `DREAMER_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `DREAMER_LOG_FILE` | auto | `1` to force file logging, `0` to disable |
| `DREAMER_HEADED_MODE` | auto | `static` (binary) or `dev` (spawn Vite) |
| `API_PORT` | `4112` | API port in headed mode |
| `APP_PORT` | `3004` | Web UI port in headed mode |
| `DATA_DIR` | (legacy) | Alias for `DREAMER_HOME` — used by tests |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Agent / runtime error (version conflict, generic error) |
| `2` | Invalid input (bad flag, missing prompt, ambiguous scene, schema validation failure) |
| `70` | Unexpected non-`Error` throw (internal bug) |
| `130` | User cancelled (Ctrl+C / `AgentAbortedError`) |

## Architecture

This package is a thin driver over `@dreamer/api`. It does not fork the agent. The CLI's responsibilities are:

- Parse CLI arguments (`cli-args.ts`) into a typed `Command` discriminated union.
- Start the readline REPL loop (`repl.ts`).
- Call `streamCoreAgent` from `@dreamer/api` directly (in-process, no HTTP) and render tokens to stdout (`runner.ts`, `renderer.ts`).
- Shell out to `arduino-cli` via the toolchain resolver for compile/flash/monitor (`compile-flash.ts`).
- Serve the embedded web UI (`web-ui.ts`) in headed mode when running as a compiled binary; spawn Vite in dev mode.
- Wire SIGINT to abort in-flight agent runs, write crash reports, and clean up temp directories.

Everything agent-related — tools, router, planner, memory, project/board state — lives in `@dreamer/api` and is shared with the HTTP route used by the web UI. A new agent tool shows up in both surfaces automatically.

## Building a standalone binary

```bash
bun run build:cli
```

Chains `vite build` (packages/app) → asset manifest generator → five cross-compiled binaries under `dist/`:

| Target | Binary | Size |
|---|---|---|
| macOS ARM64 | `dreamer-darwin-arm64` | ~64 MB |
| macOS x64 | `dreamer-darwin-x64` | ~69 MB |
| Linux ARM64 | `dreamer-linux-arm64` | ~100 MB |
| Linux x64 | `dreamer-linux-x64` | ~100 MB |
| Windows x64 | `dreamer-windows-x64.exe` | ~116 MB |

The binaries include the Bun runtime, all dependencies, and the production web UI bundle. No `node_modules`, no source tree, no external Node required.

Build a single target:

```bash
bun run --cwd packages/cli build:darwin-arm64
```

## Dev workflow

Two options:

**Full source dev (HMR, fast):**

```bash
bun run dev          # API on 4111, Vite on 3000
```

**Headed-mode dev (REPL + UI on 4112 / 3004):**

```bash
bun cli headed                              # serves embedded bundle if built
DREAMER_HEADED_MODE=dev bun cli headed      # force Vite spawn (HMR)
```

After running `bun run build:webui` once, the generated manifest has `ASSET_COUNT > 0` and `bun cli headed` defaults to static mode. Set `DREAMER_HEADED_MODE=dev` or clear the manifest (`rm -rf packages/app/dist && bun run scripts/generate-asset-manifest.ts`) to return to live Vite development.

## Notes for distribution

- **macOS**: binaries are ad-hoc signed automatically by `bun build --compile`, which is enough to run. Browser-downloaded binaries carry the `com.apple.quarantine` xattr — clear with `xattr -d com.apple.quarantine dreamer` once per download. `curl`-installed binaries and Homebrew-installed ones bypass quarantine.
- **Windows**: unsigned `.exe` triggers SmartScreen's "unknown publisher" warning. Users click "More info → Run anyway" once.
- **Linux**: no signing required.
- **Serial monitor** in compiled binaries uses `arduino-cli monitor`, not the `serialport` npm package — no Node subprocess, no native addons. Live on-board telemetry works; the UI's Serial Monitor panel streams directly.

## Troubleshooting

**`arduino-cli not found`**: run `dreamer setup`, or install manually from <https://arduino.github.io/arduino-cli/>. If installed to a non-standard path, set `DREAMER_ARDUINO_CLI=/path/to/arduino-cli`.

**`ANTHROPIC_API_KEY is not set`**: `dreamer config set anthropic-key sk-ant-...` or export the env var.

**REPL appears to exit immediately**: you're piping stdin to the binary (e.g. from a background shell). The REPL needs a TTY to stay alive. Run it in a real terminal.

**`EADDRINUSE` on 4112 or 3004**: a previous `dreamer headed` didn't shut down cleanly. Kill stragglers: `lsof -iTCP:3004 -iTCP:4112 -sTCP:LISTEN -t | xargs kill`.

**Web UI shows old content**: Vite's `define` substitutions are baked at build time. Run `bun run build:webui` before `bun build --compile` to pick up latest web changes. Hard-refresh (Cmd+Shift+R) in the browser to clear the cache.

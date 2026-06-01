# MCP Server — drive Dreamer from Claude

Dreamer ships a [Model Context Protocol](https://modelcontextprotocol.io/) server
(`dreamer mcp`) that lets **your own** Claude (Claude Code, Claude Desktop) or any
MCP client place components, wire them up, and write the sketch for a project.

The difference from a plain "generate me a circuit" tool: when the MCP edits a
project, the change appears on your **open Dreamer canvas in real time** — no
import, no reload. You keep the tab open and watch the board build itself.

```
Claude (your client) ──tools──▶ dreamer mcp ──writes──▶ project file on disk
                                                              │ (version bump)
   running Dreamer (dev server or desktop app) ── file-watch ─┘
        └─ pushes the new board over WebSocket ─▶ your open tab updates live
```

The live bridge is a **local** feature (the dev server, the `dreamer` CLI, or the
desktop app). It is disabled on the hosted/cloud deployment.

---

## 1. Install the `dreamer` CLI

The MCP server is the `dreamer` binary running in `mcp` mode. Get the binary one
of these ways:

- **npx** (no install): `npx dreamer …`
- **Desktop app**: the `dreamer` binary is bundled inside it — already on hand.
- **From source** (this repo): run it via `bun run cli -- …` (see §2).

Run `dreamer help` to confirm it's available; you should see the `mcp` subcommand:

```
mcp   Start an MCP server over stdio (for Claude Desktop / Cursor / etc.)
```

---

## 2. Connect Claude

The MCP operates on **one project at a time**, identified by its project id. Get
the id from the in-app **Connect Claude (MCP)** dialog (`Cmd/Ctrl+K` →
"Connect Claude"), which also shows ready-to-copy commands, or list projects with
`dreamer projects`. You can also start without an id and call the
`set_current_project` tool first.

### Claude Code (CLI)

```bash
claude mcp add dreamer -- dreamer --project <id> mcp
```

From source in this repo (no installed binary):

```bash
claude mcp add dreamer -- bun /ABSOLUTE/PATH/to/dreamer/packages/cli/src/index.ts --project <id> mcp
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) — the equivalent config path on your OS — then restart Claude Desktop:

```json
{
  "mcpServers": {
    "dreamer": {
      "command": "dreamer",
      "args": ["--project", "<id>", "mcp"]
    }
  }
}
```

> stdio is reserved for the MCP protocol — all logs go to stderr, so it won't
> corrupt the stream.

---

## 3. Watch it build live

1. Open the project in Dreamer (`bun run dev` → http://localhost:3000, the
   `dreamer` CLI, or the desktop app). Note its project id.
2. Connect Claude to that **same** id (§2).
3. Chat with Claude — e.g. *"add an LED on pin 13 through a 220Ω resistor and
   blink it."* Claude calls `apply_design` / `update_sketch`; the canvas updates
   within ~0.5 s. Hit **Run** to simulate.

Your own canvas edits are unaffected: autosave doesn't bump the project version,
so only MCP-originated changes are pushed — there's no feedback loop.

---

## 4. Tools

All per-project tools act on the currently selected project.

| Tool | Purpose |
|------|---------|
| `list_projects` | List every project on disk under `DREAMER_HOME`. |
| `get_current_project` | The project id this session targets (or null). |
| `set_current_project` | Select a project by id for subsequent calls. |
| `get_board_state` | Current board as a `DreamerDiagram` (DSL v1). |
| `list_components` | Components in DSL shape (`id`, `type`, `at:[x,y]`, …). |
| `list_wires` | Wires with readable endpoints (`arduino.13`, `led1.anode`). |
| `get_sketch_code` | The project's Arduino sketch source. |
| `get_component_details` | One component by id. |
| `analyze_power_budget` | Per-pin / rail load + electrical-safety report. |
| `get_wiring_guide` | Wire colours, rules, footprints, pin aliases. |
| `validate_design` | Dry-run check a `DreamerDiagram` (no writes). Run before `apply_design`. |
| `apply_design` | Atomically replace the board with a `DreamerDiagram` (+ sketch). |
| `update_sketch` | Replace the sketch (validated: balanced braces, `setup`/`loop`). |
| `patch_sketch` | Replace a 1-indexed, end-inclusive line range in the sketch. |

`DreamerDiagram` is the same DSL the in-app agent uses — components placed at
`[row, col]`, wires as endpoint strings. See the `get_wiring_guide` tool and
`packages/schemas/src/design.ts` for the full grammar.

## Resources

| URI | What |
|-----|------|
| `dreamer://projects` | Index of every project on disk. |
| `dreamer://projects/{projectId}` | One project's full `DreamerDiagram`. |
| `dreamer://projects/{projectId}/sketch` | One project's sketch as text. |
| `dreamer://wiring-guide` | Static wiring reference (markdown). |

---

## 5. Example session

> **You:** Build a circuit that reads a DHT11 and shows the temperature on a 16×2 LCD.
>
> **Claude:** *(calls `validate_design` → `apply_design` → `update_sketch`)*
> Placed the DHT11 and LCD, wired them, and wrote the sketch. The LCD shows the
> temperature in the simulator.

While that runs, the components, wires, and sketch appear on your open canvas as
Claude makes each call.

---

## 6. Troubleshooting

- **Canvas doesn't update.** Confirm you're running locally (the bridge is off on
  the hosted deployment), the open project id matches the `--project <id>` you
  registered, and the tab is still open. The dev server is `http://localhost:3000`;
  the CLI/desktop server is on its own loopback port.
- **`command not found: dreamer`.** The binary isn't on `PATH`. Use `npx dreamer`,
  the desktop bundle, or the from-source `bun …` form in §2.
- **No project selected.** Pass `--project <id>` or call `set_current_project`
  first.
- **Edits don't reach the running app even though tool calls succeed.** The MCP
  writes the project file directly; the running app's watcher reads it
  owner-agnostically. If writes succeed in the MCP but nothing shows, verify the
  project's `version` is incrementing on disk under `DREAMER_HOME`.

### Developing the desktop app

`desktop:dev` serves the **prebuilt** UI baked into the sidecar binary, so your
code changes don't hot-reload there. To make the desktop window reflect current
code, force a sidecar rebuild: `bun run desktop:dev:fresh` (or do day-to-day
frontend work with `bun run dev`, which has hot reload and the same live bridge).

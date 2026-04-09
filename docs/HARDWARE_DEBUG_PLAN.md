# Hardware Debug Plan

Hybrid simulator + real Arduino debugger. Same UI, two runtime modes — simulated or live hardware.

## What we're building

```
┌────────────────────────────────────────────┐
│           Dreamer UI (unchanged)           │
│  breadboard · inspector · serial monitor  │
│          play + upload controls            │
└─────────────┬──────────────┬──────────────┘
              │              │
    [sim mode]│              │[hardware mode]
              ▼              ▼
     AVR mode (avr8js)   Real Arduino
     cycle-accurate      USB serial
     pin states          pin telemetry
```

The switch is automatic: board connected → hardware mode. Both run in parallel — the sim is always the reference "expected" side.

---

## Dependency order

```
A1 → A2 → A3 → A4 → A5         serial infrastructure
              ↓
         F1+F2                  board status pill + port picker
              ↓
         B1 → B2 → B3+F3        compile + flash + upload button
                       ↓
         C1 → C2 → C3 → C4 → C5+F4    hybrid diff + pin inspector
                                   ↓
                       D1 → D2 → D3 → D4+F5 → D5+F6    debug agent + UI gates

E1–E3   transpiler pointer fixes (independent, any time)
F7      serial timestamp fix (independent, any time)
```

---

## Track A — Serial via API

> **Why:** Web Serial is Chromium-only and breaks on tab refresh. Moving to the API server gets all browsers, auto port detection, and a persistent connection. This is the prerequisite for everything else.
>
> **Key decision:** `node-serialport` has fragile native bindings on Bun. Wrap it behind an interface and run it in a Node child process from day one — don't discover this mid-project.

**A1 — `serialport-bridge.ts`**
- `packages/api/src/serial/serialport-bridge.ts`
- Spawns a Node child process that imports `serialport`; communicates over stdio with newline-delimited JSON
- Exposes: `list(): Promise<{path, manufacturer}[]>`, `open(path, baud): AsyncIterable<string>`, `write(path, data): void`, `close(path): void`
- ✅ Done when: `bun run dev:api` lists USB ports on macOS and Linux without crashing

**A2 — `board-manager.ts`**
- `packages/api/src/serial/board-manager.ts`
- Module-level singleton (`Map<path, { subscribers: Set<WSContext>, buffer: TelemetryFrame[] }>`)
- `subscribe(path, baud, ws)` — opens port if not open, adds WS subscriber
- `unsubscribe(path, ws)` — removes subscriber, closes port on last unsubscribe
- `write(path, data)` — forwards to bridge
- Module-level so it survives Vite HMR (same pattern as `boardTracker`)
- ✅ Done when: two browser tabs can subscribe to the same port without duplicate-open error

**A3 — `GET /api/boards` and `WS /api/boards/:encodedPath`**
- `packages/api/src/routes/boards.ts`
- `GET /api/boards` → `{ ports: {path, manufacturer}[], cliAvailable: boolean }`
- Uses `SerialPort.list()` (fast, instant), not `arduino-cli board list` (~2s)
- `WS /api/boards/:encodedPath?baud=9600` — delegates to `board-manager.subscribe()`; incoming WS messages forwarded to `board-manager.write()`
- Wire into `index.ts`: `.use(boardRoutes)`
- ✅ Done when: wscat can connect, type a character, and see it echoed from a real Arduino

**A4 — Replace Web Serial with WebSocket client**
- New file `packages/app/src/simulator/local-board.ts` — WebSocket client with identical exported shape to `WebSerialConnection` (`connect/disconnect/write/isConnected` + callbacks)
- `serial-monitor.tsx`: swap import `web-serial` → `local-board`; remove `isWebSerialSupported()` check; port selection moved to F2
- ✅ Done when: Firefox can connect to a real Arduino (was impossible with Web Serial)

**A5 — Telemetry frame filter**
- In `local-board.ts` `onData` handler, split incoming text line by line before any callback fires
- Lines matching `/^D\|\d+\|[01]+\|[\d,]+$/` → route to `onTelemetry` callback only, never to `onData`
- All other lines → `onData` as before
- ✅ Done when: a sketch running the debug shim produces zero garbage lines in the serial monitor

---

## Track B — Compile and flash

> **Why:** `POST /api/compile` already exists and works. Flash is one more shell-out. The only real work is the board reset window and the line number offset fix.

**B1 — Fix compiler error line numbers**
- `arduino-cli compile` prepends include lines, offsetting reported line numbers
- Parse `stderr` to extract `sketch.ino:N:M:` format; subtract the injected preamble line count before returning the error
- ✅ Done when: a syntax error on line 5 reports as line 5, not line 8

**B2 — `POST /api/flash`**
- `packages/api/src/routes/flash.ts`
- Accepts `{ port: string, code: string }` — compiles to `.hex` (reuse compile logic), then `arduino-cli upload -p <port> --fqbn arduino:avr:uno --input-file sketch.hex`
- Returns `{ success, stdout, stderr }` — buffer and return, no SSE needed (takes 3–5s)
- On success: call `board-manager.reconnect(path, 2500)` — closes port, waits 2.5s for bootloader, reopens; frontend gets a `reconnecting` event on the WS, not a disconnect error
- ✅ Done when: flashing a real Uno from the UI, serial monitor reconnects automatically within 3s

**B3 — Upload button in `play-controls.tsx`** *(paired with F3)*
- See F3 for the full UI spec
- Backend dependency: B2 must exist first
- ✅ Done when: button triggers B2 and shows the correct state transitions

---

## Track C — Hybrid sim + real diff

> **Why:** The existing `"avr"` VMMode uses `avr8js` for cycle-accurate ATmega328P simulation — this is the correct "expected" side of the diff, not the JS transpiler which has known bugs. When a real board is connected, switch to AVR mode automatically.

**C1 — Auto-switch to AVR mode when board is connected**
- `simulation-loop.ts`: when `useBoardConnection().connected` becomes true, call `vm.setMode("avr")`; on disconnect, revert to `"transpile"`
- AVR mode requires a compiled `.hex` — trigger `POST /api/compile` automatically on connect if a sketch is loaded
- ✅ Done when: plugging in a board starts AVR simulation; unplugging falls back to transpiler mode

**C2 — Debug shim injector**
- New function `injectDebugShim(code: string): string` in `arduino-transpiler.ts`
- Prepends the `__d_report()` function, injects `__d_report();` at the top of the `loop()` body only
- Frame format: `D|<millis>|<d0..d13>|<a0,a1,a2,a3,a4,a5>`
- Report guard: `if (millis() - __d_lastReport < 50) return;` to limit to 20 frames/sec
- Must not modify `setup()` or any user-defined functions
- ✅ Done when: `injectDebugShim("void setup(){} void loop(){}")` produces valid compilable C++

**C3 — Telemetry buffer in `board-manager.ts`**
- Parse incoming lines matching the `D|` frame format in the board manager (not the frontend)
- Rolling buffer: last 5 seconds of `TelemetryFrame` objects keyed by timestamp
- Expose: `getLatestSnapshot(path): TelemetrySnapshot | null`, `getWindow(path, ms): TelemetrySnapshot[]`
- Add `GET /api/boards/:encodedPath/telemetry` for agent tools to query
- ✅ Done when: telemetry endpoint returns structured `{digital: number[], analog: number[]}` while a sketch is running

**C4 — `useBoardTelemetry()` hook**
- `packages/app/src/simulator/board-telemetry.ts`
- Reads from the `onTelemetry` callback of the `local-board.ts` connection (A5)
- Returns `{ latestSnapshot: TelemetrySnapshot | null, connected: boolean }`
- `latestSnapshot.digital[n]` — real pin HIGH/LOW (0 or 1) for pins 0–13
- `latestSnapshot.analog[n]` — real ADC value 0–1023 for A0–A5
- ✅ Done when: hook returns correct values in a test component while a real Arduino runs blink

**C5 — Pin diff columns in inspector** *(paired with F4)*
- See F4 for the full UI spec
- ✅ Done when: mis-wired LED shows amber divergence in the inspector within one blink cycle

---

## Track D — Debug agent tools

> **Why:** The agent already gets board wiring context. With telemetry it can see both what *should* happen and what *is* happening — a diagnostic capability no other hobbyist tool offers. All tools in this track are read-only or require explicit user confirmation before touching the board.

**D1 — `"debug"` ToolMode in `createCoreTools`**
- Add `"debug"` to `ToolMode` union in `tools.ts`
- `DEBUG_MODE_TOOLS` set: `get_board_state`, `get_wiring_guide`, `read_pin_telemetry`, `compare_sim_vs_real`, `analyze_divergence`, `propose_sketch_fix`, `inject_probe`
- System prompt for debug mode: receives board state + telemetry window; role is diagnosis, not construction
- Complexity routing: `"debug"`, `"not working"`, `"why"` already route to Sonnet — no change needed
- ✅ Done when: a "debug" intent routes to `createCoreTools({ mode: "debug" })` with the correct tool set

**D2 — `read_pin_telemetry` tool**
- Calls `GET /api/boards/:path/telemetry?window=3000` (C3)
- Returns `{ timestamp, digital: number[], analog: number[] }[]` — last 3 seconds of frames
- ✅ Done when: agent call returns parseable telemetry while a sketch runs

**D3 — `compare_sim_vs_real` tool**
- Fetches AVR VM pin states (from `simulationRef`) + latest telemetry snapshot (D2)
- Returns `{ pin, simValue, realValue, divergedMs }[]` filtered to only diverging pins
- ✅ Done when: agent correctly identifies pin 13 diverging when an LED is unwired

**D4 — `propose_sketch_fix` tool** *(paired with F5)*
- Agent returns `{ proposedCode: string, explanation: string }` — no compile or flash
- Frontend shows sketch diff panel (F5); user must click "Apply & Flash" to proceed
- Tool result carries `{ pendingUserAction: "review_fix" }` so the agent stream stops
- ✅ Done when: agent proposes a fix, diff panel opens, board is not touched until user confirms

**D5 — `inject_probe` tool** *(paired with F6)*
- Agent specifies `{ afterLine: number, expression: string }` — e.g. print a pin value
- Tool returns `{ pendingUserAction: "confirm_probe", proposedCode }` and halts
- UI shows confirmation dialog (F6); user must click "Add & Flash"
- Agent cannot chain probe + flash in a single turn
- ✅ Done when: agent cannot flash without user clicking confirm

---

## Track E — Transpiler pointer fixes

> **Why:** Real-world Arduino sketches use pointers more than beginner examples. The current transpiler hard-blocks on any pointer pattern. E1–E3 cover the 90% case; full pass-by-reference is explicitly deferred.

**E1 — `char*` and `char[]` as string aliases**
- `char* name = "value"` and `char name[] = "value"` → `let name = "value"`
- Add to the var decl regex in `transpileLine`
- ✅ Done when: `char* greeting = "Hello";` compiles and `Serial.print(greeting)` outputs correctly

**E2 — Pointer-typed function parameters**
- `void foo(int* arr, int len)` → `function foo(arr, len)` — strip `*` from params
- JS arrays are already pass-by-reference; no semantics change needed
- ✅ Done when: `void printArr(int* arr, int len)` transpiles and iterates correctly

**E3 — `POINTER_MODE` warn flag**
- `transpile(code, libs, { pointerMode: "warn" | "block" })` — default `"block"` preserves existing behaviour
- `"warn"` mode: emit `TranspileWarning`, continue, replace unsupported pointer ops with `throw new Error("unsupported")`
- ✅ Done when: a sketch with mild pointer use in warn mode fails at runtime with a clear message, not at transpile time

**E4 — Document pass-by-reference as unsupported**
- Change the current error message from `"Pointer arithmetic is not supported"` to `"Pass-by-reference (&) is not supported — use return values or global variables instead"`
- No implementation work; this is a documentation + UX fix
- ✅ Done when: the error message tells the user what to do instead

---

## Track F — UI

> **Why:** The original plan treated UI as an afterthought. Three concrete problems with the current state:
> - Port selection is buried in the serial monitor but flash also needs it — port must be toolbar-level
> - No persistent board status indicator anywhere in the UI
> - `propose_sketch_fix` and `inject_probe` are unusable without review/confirm UI (F5, F6)

**F1 — Board status pill in bottom toolbar**
- New `useBoardConnection()` hook — polls `GET /api/boards` every 3s
- Renders a small pill in `bottom-toolbar.tsx` (right of play controls): green dot + port name when connected, grey "No board" when not
- Clicking the pill opens the port picker popover (F2)
- ✅ Done when: pill updates within 3s of plugging/unplugging a board

**F2 — Port picker popover**
- Base UI `Popover` attached to the F1 pill
- Lists ports with manufacturer; connect/disconnect button per port
- Shows an "arduino-cli not installed" banner with install link when `cliAvailable: false`
- Selected port stored in a module-level store shared by serial monitor and flash route
- `serial-monitor.tsx` removes its internal port picker; reads shared selected port instead
- ✅ Done when: selecting a port in the popover connects the serial monitor with no further interaction

**F3 — Upload button in `play-controls.tsx`**
- Rendered after Stop button; visible only when a port is selected
- Icon: `Upload` (lucide), teal — visually distinct from green Play
- States: `idle` → `compiling` (Cpu pulse blue) → `flashing` (Zap pulse teal) → `reconnecting` (spinner) → `done` / `error` (AlertCircle red + truncated message)
- Does NOT stop the simulator — both run simultaneously
- ✅ Done when: board flashes and serial monitor reconnects; simulator keeps running throughout

**F4 — Pin inspector diff columns**
- When `useBoardConnection().connected`: add **Real** and **Δ** columns to the existing table
- **Real**: value from `useBoardTelemetry().latestSnapshot`; grey `—` if no telemetry yet
- **Δ**: amber `!` if sim ≠ real for >100ms; green `✓` if matching
- Narrow panel (<180px): collapse to a single coloured dot per row (green/amber/grey)
- Tooltip on amber: "Sim: HIGH · Board: LOW · 320ms"
- ✅ Done when: mis-wired LED shows amber on the correct pin within one blink cycle

**F5 — Sketch diff panel** *(required by D4)*
- New `packages/app/src/panels/sketch-diff.tsx`
- Opens as a dockview panel when agent returns a `propose_sketch_fix` result
- Side-by-side read-only CodeMirror: current (left) vs proposed (right), changed lines highlighted
- Buttons: "Apply & Flash" (disabled if no board connected, tooltip "Connect a board first") and "Dismiss"
- Accepting flashes via B2 and closes the panel
- ✅ Done when: agent proposes a fix → diff panel opens → user can accept or dismiss → board is only touched on explicit accept

**F6 — Probe confirmation dialog** *(required by D5)*
- Base UI `Dialog` triggered when agent returns `pendingUserAction: "confirm_probe"`
- Shows the exact line to be injected in a code block
- Buttons: "Add & Flash" (primary) and "Cancel"
- Agent stream is suspended until user responds
- ✅ Done when: no path exists for the agent to flash a probe without user clicking "Add & Flash"

**F7 — Fix serial monitor timestamps**
- Add `timestamp: number` to the `APPEND_SERIAL` board machine action, set to `Date.now()` at dispatch time
- `serialOutput` entries: `{ text: string, timestamp: number }[]` instead of `string[]`
- `formatLine` reads `entry.timestamp` instead of `new Date()` at render
- ✅ Done when: lines that arrived 5 seconds ago display the correct time when timestamps are enabled

---

## Effort

| Track | Tasks | Effort |
|---|---|---|
| A — Serial via API | A1–A5 | 1.5 days |
| B — Compile + flash | B1–B3 | 0.5 days |
| C — Hybrid diff | C1–C5 | 2 days |
| D — Debug agent | D1–D5 | 1.5 days |
| E — Pointer fixes | E1–E4 | 0.5 days |
| F — UI | F1–F7 | 1.5 days |
| **Total** | 26 tasks | **~7.5 days** |

Ship order: A → B → F1–F3 → C → F4 → D + F5–F6. E and F7 land independently at any point.

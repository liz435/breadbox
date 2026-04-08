# Velxio Feature Adoption Roadmap

> Features to adopt from [Velxio](https://github.com/davidmonterocrespo24/velxio) that make Dreamer competitive across the full spectrum — beginners to advanced makers — without losing the instant-feedback + SPICE edge.

## Our Edge (Extend, Don't Sacrifice)

| Advantage | Strategy |
|-----------|----------|
| **Instant transpile** (~0ms compile) | Keep as default for all boards. Real compilation is opt-in "accuracy mode". |
| **SPICE circuit analysis** | Extend per-board with correct voltage levels (3.3V for ESP32, 5V for Uno). |
| **Zero backend for core flow** | Transpile + in-browser emulation for AVR and RP2040. Backend only for Xtensa/QEMU boards. |
| **AI-native agent** | Board-aware — agent knows which board is active, adjusts pin suggestions. |
| **Custom SVG renderers** | Keep. Add board-specific renderers (ESP32 DevKit, Pico, Nano, Mega). |
| **100-step undo/redo** | Unchanged. |

---

## Tier 0 — Multi-Board Foundation

This is the prerequisite for everything else. The codebase currently has **50+ hardcoded Arduino Uno assumptions** scattered across stdlib, VM, linter, circuit solver, renderer, and schemas. These need to be extracted into a board definition layer.

### 0. Board Abstraction Layer

**What Velxio does:** 19 boards across 5 architectures with per-board configs.
**Our current state:** Uno hardcoded everywhere — pin count (20), PWM pins (3,5,6,9,10,11), voltage (5V), clock (16MHz), memory (32KB/2KB), interrupt mapping (pin 2/3), analog range (A0-A5), EEPROM size (1024).

**Implementation — the `BoardDefinition` type:**

```ts
type BoardDefinition = {
  id: string                          // "arduino_uno" | "arduino_nano" | "arduino_mega" | "esp32" | "pico"
  name: string                        // "Arduino Uno"
  mcu: string                         // "ATmega328P" | "ATmega2560" | "ESP32" | "RP2040"
  arch: "avr8" | "xtensa" | "arm" | "riscv"
  clockHz: number                     // 16_000_000 | 240_000_000 | 133_000_000
  flashBytes: number                  // 32768 | 262144 | 4194304
  sramBytes: number                   // 2048 | 8192 | 264000
  eepromBytes: number                 // 1024 | 4096 | 0
  logicVoltage: number                // 5.0 | 3.3
  pins: PinDefinition[]               // full pin map with capabilities
  analogPins: number[]                // [14,15,16,17,18,19] for Uno
  pwmPins: number[]                   // [3,5,6,9,10,11] for Uno
  interruptPins: Map<number, number>  // interrupt# → pin#
  defaultBaudRate: number             // 9600
  portMap?: AvrPortMap                // AVR-specific port registers
  boardRenderer: string               // component key for SVG renderer
  boardWidth: number                  // pixel width for canvas placement
  boardHeight: number                 // pixel height for canvas placement
}
```

**Files that need board-parameterization (priority order):**

| File | Hardcoded Values | Change |
|------|-----------------|--------|
| `arduino-stdlib.ts` | Pin range 0-19 in 6+ functions, EEPROM 1024, A0-A5 constants | Read from active board definition |
| `arduino-linter.ts` | PWM pins [3,5,6,9,10,11], analog pins [14-19] | Read from active board definition |
| `netlist-builder.ts` | 5V and 3.3V voltage constants | Use `board.logicVoltage` |
| `arduino-vm.ts` | 16MHz, 20-pin arrays | Use `board.clockHz`, `board.pins.length` |
| `avr-runner.ts` | ATmega328P memory (0x4000/0x800), port map | Use `board.flashBytes`, `board.portMap` |
| `breadboard-grid.ts` | Digital pins D0-D13, analog A0-A5, power pins | Generate from `board.pins` |
| `schemas/arduino.ts` | `pin: z.number().max(19)` | Use `z.number().max(board.pins.length - 1)` |
| `pin-inspector.tsx` | `pin >= 14 && pin <= 19` for analog | Use `board.analogPins.includes(pin)` |
| `simulation-loop.ts` | `pin >= 14 && pin <= 19` | Same |
| `schematic-layout.ts` | Pin label generation, power pin IDs | Use board pin definitions |

**Board definitions to ship initially (4 boards):**

| Board | Arch | In-Browser? | Notes |
|-------|------|-------------|-------|
| **Arduino Uno** | avr8 | Yes (avr8js) | Current default, no new work |
| **Arduino Nano** | avr8 | Yes (avr8js) | Same MCU as Uno, different form factor + renderer |
| **Arduino Mega 2560** | avr8 | Yes (avr8js) | ATmega2560: 54 digital, 16 analog, 15 PWM, 256KB flash |
| **ESP32 DevKit** | xtensa | Transpile only initially | 3.3V logic, 34 GPIO, WiFi stub, 520KB SRAM |

**Phase 2 boards (add later):**

| Board | Arch | In-Browser? | Notes |
|-------|------|-------------|-------|
| Raspberry Pi Pico | arm | Yes (rp2040js) | 26 GPIO, 3.3V, PIO, 264KB SRAM |
| ATtiny85 | avr8 | Yes (avr8js) | 6 pins, 8KB flash — great for teaching constraints |
| ESP32-C3 | riscv | Transpile only | RISC-V, 3.3V, WiFi/BLE |
| Arduino Leonardo | avr8 | Yes (avr8js) | ATmega32U4, native USB |

**How the transpiler stays instant for all boards:**
- The transpiler is already board-agnostic — it does C++ → JS conversion without pin knowledge
- Board-specific behavior lives in the **stdlib shim**, not the transpiler
- Each board gets its own stdlib factory: `createStdlib(board: BoardDefinition)` → generates the right pin count, voltage, PWM set, analog range, interrupt map
- Linter reads from the active board to validate pin usage
- Circuit solver reads `board.logicVoltage` instead of hardcoded 5V

**How the SPICE solver extends per board:**
- `netlist-builder.ts` already parameterizes voltage per pin — just needs to read from board definition instead of hardcoded 5/3.3
- ESP32's 3.3V logic means different current/brightness calculations — the solver handles this naturally once the voltage source is correct
- ADC resolution per board (10-bit for AVR, 12-bit for ESP32/Pico) affects `analogRead` range — stdlib shim handles this

**Effort:** ~1 week for the abstraction layer + Uno/Nano/Mega definitions. ~3 days more for ESP32 transpile-mode support.

---

## Tier 1 — High Impact, Low Effort
<!-- 
### 1. Component Palette Search + Categories -->

**What Velxio does:** Searchable component picker with category filters and descriptions.
**Our current state:** Flat list of 16 items, no search, no categories.

**Implementation:**
- Add a search input at the top of `component-palette.tsx`
- Group components into categories: Output, Input, Passive, Display, Other
- Show one-line description on hover or below the label
- Filter by search text matching name, type, or description

**Effort:** ~2 hours. **Impact:** Major UX improvement for discoverability.

---

### 2. Orthogonal Wire Routing Option

**What Velxio does:** Wires route at 90-degree angles (Manhattan routing) with 8 signal-type colors.
**Our current state:** Bezier curves, 6 colors (by pin category).

**Implementation:**
- Add a routing mode toggle: Bezier (default) vs. Orthogonal
- Orthogonal mode: calculate L-shaped or Z-shaped path between endpoints
- Keep Bezier as default — it looks more natural for an educational tool
- Standardize wire colors: use a single color constant per semantic category (fix the dual-red issue `#ef4444` vs `#ff0000`)

**Effort:** ~4 hours. **Impact:** Cleaner visuals for complex circuits.

---

### 3. Wire Editing (Drag Endpoints)

**What Velxio does:** Segment-based wire editing.
**Our current state:** Wires can only be created and deleted (SHIPPING_BLOCKERS #14).

**Implementation:**
- Click wire → show endpoint handles (circles at `from` and `to`)
- Drag handle → snap to nearest grid hole → dispatch `UPDATE_WIRE` event
- Add `UPDATE_WIRE` event to board machine (with auto-snapshot)

**Effort:** ~4 hours. **Impact:** Eliminates a shipping blocker. Essential for usability.

---

### 4. Multi-File Editor Tabs

**What Velxio does:** Monaco Editor with multi-file workspace (`.ino`, `.h`, `.cpp`).
**Our current state:** Single-file CodeMirror editor.

**Implementation:**
- Add a tab bar above the editor for: main sketch + custom library files
- Clicking a custom library tab loads that library's code into the editor
- Changes auto-save to `customLibraries` in board state
- Reuse existing CodeMirror instance — just swap the document

**Effort:** ~6 hours. **Impact:** Unlocks real multi-file projects.

---

### 5. Export/Import Projects

**What Velxio does:** Self-contained project files with persistence.
**Our current state:** Server-only persistence, no export (SHIPPING_BLOCKERS #21).

**Implementation:**
- **Export as .zip:** Bundle sketch + libraries + board state (components/wires/board type) as JSON
- **Export .ino:** Download just the sketch file
- **Import .zip:** Load board state, restore everything
- Include board type in export so projects open with the correct board

**Effort:** ~4 hours. **Impact:** Essential for sharing.

---

### 6. Keyboard Shortcuts Help Dialog

**What Velxio does:** Discoverable shortcut reference.
**Our current state:** Shortcuts exist but undocumented (SHIPPING_BLOCKERS #20).

**Implementation:**
- Press `?` → Base UI Dialog listing all shortcuts
- Effort: ~1 hour.

---

## Tier 2 — High Impact, Medium Effort

### 7. Expanded Component Library (24+)

**What Velxio does:** 48+ components via wokwi-elements.
**Our current state:** 16 components with custom SVG renderers.

**Priority additions (8 new components):**

| Component | Why | Renderer Complexity |
|-----------|-----|-------------------|
| NeoPixel / WS2812 LED strip | Most popular Arduino accessory, works across all boards | Medium |
| PIR Motion Sensor | Common in starter kits | Low |
| Relay Module | Teaches switching circuits | Low |
| DC Motor | Pairs with existing servo | Medium |
| DHT11/22 Temp+Humidity | Most popular sensor | Low |
| IR Receiver | Remote control projects | Low |
| Shift Register (74HC595) | Teaches multiplexing | Low |
| OLED Display (SSD1306) | Modern alternative to LCD, common with ESP32 | Medium |

**For each:** schema type → registry entry → SVG renderer → stdlib shim.

**Effort:** ~2-3 days. **Impact:** Covers 90% of common projects.

---

### 8. Arduino Library Index Browser

**What Velxio does:** Browses full Arduino library index, installs libraries.
**Our current state:** 6 hardcoded built-in + custom upload.

**Implementation (browser-only):**
- Fetch and cache the Arduino library index JSON
- Searchable list: name, author, description, version
- "Built-in" badge for shimmed libraries
- "Add as custom" creates a placeholder with usage examples
- Link to library docs
- Shows which libraries work in transpile mode vs. compile-only

**Effort:** ~6 hours. **Impact:** Discovery and education.

---

### 9. Compilation Error Highlighting

**What Velxio does:** Monaco shows real compiler errors inline.
**Our current state:** Lint warnings only. Transpiler errors shown as status text.

**Implementation:**
- Parse transpiler error messages for line numbers
- Push to CodeMirror's lint system as red squiggles
- For unsupported features (pointers, templates), mark the exact line
- Board-aware: linter checks pin validity against active board definition

**Effort:** ~4 hours. **Impact:** Standard IDE expectation.

---

### 10. Simulation Speed Control

**What Velxio does:** CPU emulation at native clock speed with WFI optimization.
**Our current state:** Fixed 16ms virtual time step.

**Implementation:**
- Speed slider: 0.25x, 0.5x, 1x, 2x, 4x, 10x
- Multiply `VIRTUAL_DT_MS` by speed factor
- Pause-step button: advance one loop iteration (debugging)

**Effort:** ~3 hours. **Impact:** Debugging long-running sketches.

---

### 11. Board-Specific SVG Renderers

**What Velxio does:** wokwi-elements Web Components for each board.
**Our approach:** Custom SVG renderers (keep our SPICE-integrated style).

**New renderers needed:**

| Board | Visual Design | Pin Layout |
|-------|--------------|------------|
| Arduino Nano | Smaller rectangular PCB, mini-USB, DIP form factor | D0-D13, A0-A7, same grid but narrower |
| Arduino Mega 2560 | Larger PCB, 4 rows of pins | 54 digital, 16 analog, extended grid |
| ESP32 DevKit | Black PCB, 2 rows of 19 pins, micro-USB | GPIO 0-39, 3.3V/GND rails |
| Raspberry Pi Pico | Green PCB, USB-C, 40-pin header | GP0-GP28, 3V3, GND, ADC |

Each renderer follows the same pattern as `arduino-uno-renderer.tsx` — pin positions generate from board definition, click-to-wire interaction identical.

**Effort:** ~2-3 days (one renderer per day). **Impact:** Required for multi-board to be real.

---

## Tier 3 — Full Feature Parity

### 12. In-Browser RP2040 Emulation

**What Velxio does:** `rp2040js` for Pico — full 133MHz emulation in-browser.
**Our approach:** Same. `rp2040js` is MIT-licensed, actively maintained.

**Implementation:**
- Add `rp2040js` as dependency
- Create `rp2040-runner.ts` (analogous to `avr-runner.ts`)
- Wire GPIO, UART, ADC, PWM, I2C, SPI peripherals
- Integrate with existing simulation loop (board definition drives which runner to use)
- Transpile mode still works as default — RP2040 runner is "accuracy mode"

**Effort:** ~1 week. **Impact:** Pico is the #2 most popular board after Uno.

---

### 13. Pin State Debugger Panel

**What Velxio does:** Real-time pin state visualization per board.
**Our current state:** Basic pin inspector.

**Implementation:**
- Compact grid showing all pins for the active board
- Color-coded: green=HIGH, gray=LOW, orange=PWM, blue=INPUT
- Live-update during simulation (throttled to 10fps)
- Pin count and labels adapt to active board definition

**Effort:** ~4 hours. **Impact:** Essential debugging tool.

---

### 14. Public Project Sharing via URL

**What Velxio does:** Permanent URLs with auth, public/private toggle.
**Our current state:** No public links.

**Implementation:**
- "Share" button → compressed board state as URL or server snapshot
- Read-only view with "Clone to Edit" button
- Include board type in shared state

**Effort:** ~1 day. **Impact:** Viral growth.

---

### 15. Docker Deployment

**What Velxio does:** Single Docker container, fully self-hostable.
**Our current state:** No Docker (SHIPPING_BLOCKERS #5).

**Implementation:**
- Dockerfile: Bun + Vite build + Elysia
- docker-compose with env vars for ports/CORS
- Optional: include `arduino-cli` for AVR/RP2040 compilation

**Effort:** ~4 hours. **Impact:** Self-hosting for schools.

---

### 16. ESP32 Transpile Mode

**What Velxio does:** Full Xtensa emulation via QEMU (backend-required).
**Our approach:** Transpile-first. No QEMU.

**Implementation:**
- ESP32 board definition: 34 GPIO, 3.3V, 18 ADC channels (12-bit), 16 PWM (LEDC)
- Stdlib shim: `WiFi.begin()` / `WiFi.status()` stubs (return simulated values), `ledcSetup()` / `ledcAttachPin()` / `ledcWrite()` for PWM, `analogReadResolution(12)`
- Transpiler already handles all the C++ — just the stdlib needs ESP32 APIs
- SPICE solver: 3.3V logic from board definition, no changes needed

**Why no QEMU:** Our transpiler gives instant feedback. Users writing `digitalWrite()` and `analogRead()` don't need cycle-accurate Xtensa emulation — they need to see the LED light up immediately. Advanced users who need WiFi or FreeRTOS can use the real hardware.

**Effort:** ~3 days. **Impact:** ESP32 is the fastest-growing Arduino platform.

---

## Not Adopting (and Why)

| Velxio Feature | Why We Skip It |
|---|---|
| **QEMU backend** | Heavy Python infrastructure. Our transpile-first approach covers 95% of use cases without a backend. |
| **Monaco Editor** | CodeMirror 6 is lighter (50KB vs 2MB), loads faster, and we already have Arduino-specific autocomplete/linting built on it. Not worth the migration. |
| **wokwi-elements** | Our custom SVG renderers integrate with the SPICE solver (brightness, current, voltage display). wokwi-elements are on/off with no analog state. Adopting them means losing our visual differentiator. |
| **Python backend** | Bun + Elysia is faster, simpler, same language as frontend. |
| **Raspberry Pi 3 OS emulation** | Requires QEMU + disk images. Not aligned with our instant-in-browser story. Pico (via rp2040js) is the right Pi board for us. |
| **User auth system** | Build when deploying publicly. Not a differentiator. |

---

## Implementation Order

```
Phase 0 — Foundation (1.5 weeks)
  └─ Board abstraction layer (#0)
  └─ Uno + Nano + Mega board definitions
  └─ ESP32 board definition (transpile mode)

Phase 1 — Quick Wins (1 week)
  └─ Component palette search + categories (#1)
  └─ Wire editing (#3)
  └─ Export/import (#5)
  └─ Keyboard shortcuts dialog (#6)

Phase 2 — Editor + Wires (1 week)
  └─ Orthogonal wire routing (#2)
  └─ Multi-file tabs (#4)
  └─ Compilation error highlighting (#9)
  └─ Simulation speed control (#10)

Phase 3 — Board Renderers + Components (2 weeks)
  └─ Nano, Mega, ESP32 SVG renderers (#11)
  └─ 8 new components (#7)
  └─ Arduino library browser (#8)
  └─ Pin state debugger (#13)

Phase 4 — Platform (1.5 weeks)
  └─ RP2040 in-browser emulation (#12)
  └─ ESP32 transpile-mode stdlib (#16)
  └─ Public sharing (#14)
  └─ Docker deployment (#15)
```

**Total: ~7 weeks.** Ships with 4 boards, 24+ components, multi-file editor, library browser, and Docker deployment.

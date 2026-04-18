# /learn — Topic Plan

Planning doc for the full learning section. The Lessons track now spans
22 lessons covering all component types in the simulator, ranked by difficulty
(Beginner 1–7, Intermediate 8–15, Advanced 16–22). Each lesson has a
corresponding board JSON in `learn/boards/` and a TSX file in `learn/lessons/`.
When a topic moves from planned → actually written, check it off.

## Structure at a glance

Four parallel sections, each with its own sidebar group:

1. **Lessons** — the narrative path. Short, guided, interactive. (Already exists.)
2. **Arduino Uno Reference** — encyclopedia for "what is this physical board."
3. **Arduino Programming** — encyclopedia for "what can I type and what happens."
4. **Electronics Fundamentals** — encyclopedia for "why does the circuit work."

The three reference tracks are encyclopedias, not courses. Readers bounce
between them. Each concept has **exactly one canonical page**; the other tracks
link to it.

## Urgency legend

- 🟢 **Phase 1 — ship first.** Required for the existing three lessons + every
  component already in [`registry.tsx`](../components/registry.tsx).
- 🟡 **Phase 2 — ship soon.** Natural extensions; most readers will need them
  within a few lessons.
- 🔵 **Phase 3 — later.** Valuable but not gating.
- ⚫ **Phase 4 — only if asked.** Nice-to-have, defer until a user requests it.

---

## Lessons (narrative path)

### Already shipped

All 22 lessons are now live. See `LESSONS` in `learn-layout.tsx` for the full ordered list.

**Beginner (01–07):** Blink an LED, Read a Button, Fade an LED (PWM), RGB LED Color Cycle,
Control Brightness with a Pot, Current Limiting with a Resistor, Capacitor Charge and Discharge.

**Intermediate (08–15):** Read a Light Sensor, Play a Melody with a Buzzer, Sweep a Servo Motor,
Read Temperature (TMP36), Measure Distance (HC-SR04), Detect Motion with PIR,
7-Segment Counter, LCD Hello World.

**Advanced (16–22):** Temp and Humidity (DHT11), Decode IR Remote Signals, Toggle a Relay,
Control Motor Speed with PWM, LED Chaser with 74HC595, NeoPixel Rainbow, OLED Hello World.

### 🟢 Phase 1 — next lessons to ship (depends on reference pages landing first)

- 🟢 Read a Potentiometer — analog input, map to LED brightness
- 🟢 Use `millis()` instead of `delay()` — the non-blocking timing pattern
- 🟢 Blink without blocking — combining `millis()` + state variables

### 🟡 Phase 2 — lessons (NOT YET SHIPPED)

Deferred during the Phase 2 encyclopedia batch. Each lesson needs a
working `boards/<NN>-<slug>.json` circuit snapshot plus a sketch that
actually compiles and runs on the simulator — that's hand-crafted
circuit design work, not a pattern that can be written in bulk.

- 🟡 RGB LED color mixing — per-channel PWM
- 🟡 Servo sweep — the Servo library, angles 0–180
- 🟡 Piezo buzzer tones — `tone()` and `noTone()`
- 🟡 Photoresistor + LED night light — analog read → threshold → digital write
- 🟡 Temperature sensor readings — TMP36 formula, `Serial.print` debugging
- 🟡 7-segment digit counter — driving 7 pins from a digit pattern
- 🟡 LCD 16×2 "Hello World" — LiquidCrystal library, `setCursor` and `print`

### 🔵 Phase 3

- 🔵 Ultrasonic distance sensor — `pulseIn`, converting µs to cm
- 🔵 PIR motion sensor — digital input + timed output
- 🔵 DHT temperature + humidity — DHT library, `readTemperature`/`readHumidity`
- 🔵 NeoPixel strip rainbow — `Adafruit_NeoPixel`, `setPixelColor`, `show`
- 🔵 Relay + load — logic-level control of an external load
- 🔵 DC motor speed control — PWM, why you need a transistor in real life
- 🔵 Button debounce — why the button fires 5 times, how to fix it

### ⚫ Phase 4

- ⚫ Shift register (74HC595) — `shiftOut`, driving many LEDs from 3 pins
- ⚫ OLED display graphics — SSD1306 primitives
- ⚫ IR remote decoding — receiver + code table
- ⚫ Interrupts deep dive — `attachInterrupt` on pin 2/3, real-time counting
- ⚫ EEPROM persistence — surviving a reset
- ⚫ Mini project: traffic light — combines multiple lessons into one flow
- ⚫ Mini project: reaction timer — serial output + button debounce + millis

---

## Track 1 — Arduino Uno Reference

Expand the existing [`docs/pages/arduino-uno.tsx`](../docs/pages/arduino-uno.tsx)
into a real section. Scope: what the physical board is, what each part does,
which pins are special. No register-level content.

### 🟢 Phase 1

- 🟢 **Board anatomy** — labeled photo / SVG of the Uno: USB, barrel jack, ICSP
  header, reset button, onboard LEDs, pin headers. Just enough to read a
  silkscreen.
- 🟢 **Digital pins (D0–D13)** — what they do, which are PWM-capable
  (3, 5, 6, 9, 10, 11), which are special (0/1 are RX/TX; 13 has the onboard
  LED).
- 🟢 **Analog input pins (A0–A5)** — 10-bit ADC, 0–1023, voltage reference,
  when you use them. Note that A0–A5 can also be used as digital pins 14–19.
- 🟢 **Power pins** — 5V, 3.3V, GND, VIN, RESET, IOREF. What each supplies,
  safe current sourcing, the "I shorted 5V to GND" failure mode.
- 🟢 **The onboard LED (pin 13)** — why it exists, the tradition, when it
  helps debugging.

#### ✅ Phase 2 — shipped (promoted into Phase 1 during Milestone 1)

- ✅ **PWM pins in detail** — `/learn/reference/board/pwm`
- ✅ **Serial (USB)** — `/learn/reference/board/serial`
- ✅ **Hardware interrupts** — `/learn/reference/board/interrupts`
- ✅ **Timers** — `/learn/reference/board/timers`
- ✅ **Pinout diagram for the shield header** — `/learn/reference/board/shield-headers`
- ✅ **Powering the Arduino** — `/learn/reference/board/powering`

#### ✅ Phase 3 — shipped

- ✅ **I2C on the Uno** — `/learn/reference/board/i2c`
- ✅ **SPI on the Uno** — `/learn/reference/board/spi`
- ✅ **The ATmega328P microcontroller** — `/learn/reference/board/atmega328p`
- ✅ **Clock, crystal, power regulation** — `/learn/reference/board/clock-power`

### ⚫ Phase 4

- ⚫ **Bootloader** — what it is, why you don't normally need to touch it.
- ⚫ **Fuses** — conceptual mention only, link out for readers who want more.
- ⚫ **Uno vs other boards** — Mega, Nano, ESP32, RP2040. Short compare-and-
  contrast for "should I buy a different board" readers.
- ⚫ **Board revisions** — R3 vs newer, what actually matters for users.

---

## Track 2 — Arduino Programming

The C++ subset the simulator actually runs. The source of truth for "what's
supported" is [`simulator/arduino-stdlib.ts`](../simulator/arduino-stdlib.ts).
Every page in this track should match it 1:1 — if the stdlib doesn't implement
something, don't teach it here.

### C++ essentials (the narrow slice Arduino users hit)

#### 🟢 Phase 1

- 🟢 **Sketch structure** — `setup()` and `loop()`, why every sketch has
  exactly those two, execution order. The single most important page in this
  track.
- 🟢 **Variables and types** — `int`, `float`, `bool`, `char`, `String`,
  `const`, `unsigned`. Include "why int sizes matter on an 8-bit MCU."
- 🟢 **Operators** — arithmetic, comparison, logical, assignment, `++/--`. One
  page, mostly a table.
- 🟢 **Control flow** — `if`/`else`, `while`, `for`, `switch`, `break`,
  `continue`. Short, with worked examples from lesson sketches.
- 🟢 **Functions** — declaring, calling, parameters, return values, scope.
- 🟢 **Constants and `#define`** — why you use `const int LED_PIN = 13;` at
  the top of every sketch.
- 🟢 **Comments** — `//` and `/* */`, how they interact with the transpiler.

#### ✅ Phase 2 — shipped

- ✅ **Arrays** — `/learn/reference/programming/arrays`
- ✅ **Global vs local variables** — `/learn/reference/programming/global-vs-local`
- ✅ **Strings** — `/learn/reference/programming/strings`
- ✅ **Numeric limits and overflow** — `/learn/reference/programming/numeric-limits`
- ✅ **Floating point** — `/learn/reference/programming/floating-point`

#### ✅ Phase 3 — shipped

- ✅ **Structs** — `/learn/reference/programming/structs`
- ✅ **Classes (read-only)** — `/learn/reference/programming/classes`
- ✅ **Multi-file sketches** — `/learn/reference/programming/multi-file`

### Arduino API — organized by purpose, not alphabet

#### 🟢 Phase 1

- 🟢 **Digital I/O reference** — `pinMode`, `digitalRead`, `digitalWrite`,
  `HIGH`/`LOW`, `INPUT`/`OUTPUT`/`INPUT_PULLUP`. Include the pull-up story.
- 🟢 **Analog I/O reference** — `analogRead`, `analogWrite`, how 0–1023 /
  0–255 map to voltages, why `analogWrite` isn't really analog. Links to
  PWM pages.
- 🟢 **Timing reference** — `delay`, `delayMicroseconds`, `millis`, `micros`.
  Include the "why `delay()` is dangerous in real sketches" footnote so
  readers stop writing blocking loops.
- 🟢 **Serial reference** — `Serial.begin`, `Serial.print`, `Serial.println`,
  `Serial.available`, `Serial.read`, `Serial.write`. Links to the board-side
  Serial page.

#### ✅ Phase 2 — shipped

- ✅ **Math helpers** — `/learn/reference/programming/math-helpers`
- ✅ **Tone output** — `/learn/reference/programming/tone`
- ✅ **Interrupts API** — `/learn/reference/programming/interrupts-api`

#### ✅ Phase 3 — shipped

- ✅ **EEPROM** — `/learn/reference/programming/eeprom`
- ✅ **Bit manipulation** — `/learn/reference/programming/bit-manipulation`
- ✅ **shiftOut / shiftIn** — `/learn/reference/programming/shift-out-in`

#### ⚫ Phase 4

- ⚫ **Wire (I2C)** — `Wire.begin`, `beginTransmission`, `write`, `read`,
  `endTransmission`, `requestFrom`.
- ⚫ **SPI** — `SPI.begin`, `transfer`, `beginTransaction`.

### Libraries the simulator ships

One page per library class, describing the subset of methods the stdlib
actually implements. Mirror the shape of the component docs.

#### 🟢 Phase 1

- 🟢 **Servo library** — `attach`, `write`, `read`, `attached`, `detach`.
  Links from the servo component doc.

#### ✅ Phase 2 — shipped

- ✅ **LiquidCrystal library** — `/learn/reference/programming/liquidcrystal-library`
- ✅ **Adafruit_NeoPixel library** — `/learn/reference/programming/neopixel-library`
- ✅ **DHT library** — `/learn/reference/programming/dht-library`

#### ✅ Phase 3 — shipped

- ✅ **IRremote library** — `/learn/reference/programming/irremote-library`
- ✅ **Adafruit_SSD1306 library** — `/learn/reference/programming/ssd1306-library`

### Patterns (idioms, not API)

#### ✅ Phase 2 — shipped

- ✅ **Non-blocking timing with `millis()`** — `/learn/reference/programming/non-blocking-timing` (shipped earlier as Phase 1 via promotion)
- ✅ **Debouncing inputs** — `/learn/reference/programming/debounce`
- ✅ **State machines for blinking patterns** — `/learn/reference/programming/state-machines`

#### ✅ Phase 3 — shipped

- ✅ **Reading multiple sensors without blocking** — `/learn/reference/programming/multi-sensor`
- ✅ **Smoothing noisy analog reads** — `/learn/reference/programming/smoothing`
- ✅ **Finite state machines for UI flows** — `/learn/reference/programming/ui-state-machines`
- ✅ **Naming pins with const and enum** — `/learn/reference/programming/pin-naming`

### "What Dreamer can and can't run"

#### 🟢 Phase 1

- 🟢 **Supported C++ subset** — one clear page listing what works, what
  doesn't, and why. Covers:
  - Pointers and references (not supported; the transpiler rejects `*` and
    `&` by design).
  - Dynamic memory (`malloc`, `new`).
  - Direct register access (`PORTB`, `DDRB`, etc.).
  - Multi-file sketches via custom libraries (partial support).
  - Template metaprogramming (not supported).

This page is important because users will try pointer code from random
tutorials and be confused when it's rejected. Make the restrictions explicit
and give workarounds where possible.

---

## Track 3 — Electronics Fundamentals

Tightly scoped. Not a physics textbook — "enough electronics to build the
circuits Dreamer simulates without burning things out."

### Core concepts

#### 🟢 Phase 1

- 🟢 **Voltage, current, resistance** — water-flow analogy, units (V, A, Ω),
  intuition before math. Defines the terms used everywhere else.
- 🟢 **Ohm's law** — V = I × R, with three worked examples using real
  component values (LED + resistor, pull-up resistor, voltage divider).
- 🟢 **Power and current limits** — P = V × I, why things heat up, what "the
  Arduino's 5V pin supplies up to 500 mA" means in practice.
- 🟢 **Series vs parallel** — two short pages with diagrams. Key takeaway:
  "same current, add voltages" vs "same voltage, add currents."
- 🟢 **Ground is a reference, not a place** — the single most confusing
  concept for beginners. "GND just means 0 V; everything else is measured
  from it."
- 🟢 **Short circuits** — what they are, why they break things, the standard
  failure modes.
- 🟢 **DC vs AC** — one-paragraph acknowledgement. Arduino is DC. AC is out
  of scope for this reference.

#### ✅ Phase 2 — shipped

- ✅ **Kirchhoff's laws, informally** — `/learn/reference/electronics/kirchhoff`
- ✅ **Signal vs power** — `/learn/reference/electronics/signal-vs-power`

#### ✅ Phase 3 — shipped

- ✅ **Impedance, hand-wavingly** — `/learn/reference/electronics/impedance`
- ✅ **Noise and decoupling** — `/learn/reference/electronics/decoupling`

### Components as physical devices

Each page here should cross-link to its matching simulator component doc in
[`docs/pages/components/`](../docs/pages/components/).

#### 🟢 Phase 1

- 🟢 **Resistors** — what they physically are, reading color bands, E-series
  standard values, power rating, tolerance.
- 🟢 **LEDs** — forward voltage, forward current, why they need a resistor
  (Ohm's-law application), polarity (anode/cathode), color ↔ Vf relationship.
- 🟢 **Breadboards** — the most-used page in this track. How the rows are
  internally connected, the center gap, the power rails, why horizontal
  resistors straddle the gap. (Content already exists in
  [`AUTHORING.md`](./AUTHORING.md) "Breadboard connectivity rules" — lift
  it and expand.)
- 🟢 **Wires and jumpers** — solid core vs stranded, male-male vs
  male-female, wire color convention (red = V+, black = GND, etc.).

#### ✅ Phase 2 — shipped

- ✅ **Switches and buttons** — `/learn/reference/electronics/switches`
- ✅ **Potentiometers** — `/learn/reference/electronics/potentiometers`
- ✅ **Capacitors** — `/learn/reference/electronics/capacitors`
- ✅ **Diodes** — `/learn/reference/electronics/diodes`

#### ✅ Phase 3 — shipped

- ✅ **Transistors** — `/learn/reference/electronics/transistors`
- ✅ **Voltage regulators** — `/learn/reference/electronics/voltage-regulators`
- ✅ **Relays** — `/learn/reference/electronics/relays`

#### ⚫ Phase 4

- ⚫ **Inductors and transformers** — only if a relay / motor lesson needs
  flyback diode explanation.
- ⚫ **Op-amps** — out of scope for now, skip unless demand appears.

### Sensor and signal concepts

#### ✅ Phase 2 — shipped

- ✅ **Analog vs digital signals** — `/learn/reference/electronics/analog-vs-digital`
- ✅ **Voltage dividers** — `/learn/reference/electronics/voltage-dividers`
- ✅ **Pull-up and pull-down resistors** — `/learn/reference/electronics/pull-ups`
- ✅ **PWM as "fake analog"** — `/learn/reference/electronics/pwm` (shipped as Phase 1)

#### ✅ Phase 3 — shipped

- ✅ **I2C concepts** — `/learn/reference/electronics/i2c-concepts`
- ✅ **SPI concepts** — `/learn/reference/electronics/spi-concepts`
- ✅ **1-Wire** — `/learn/reference/electronics/one-wire`

### Practical / safety

#### ✅ Phase 2 — shipped

- ✅ **Current limits for Arduino pins** — `/learn/reference/electronics/current-limits`
- ✅ **Common beginner mistakes** — `/learn/reference/electronics/beginner-mistakes` (shipped as Phase 1)

#### ✅ Phase 3 — shipped

- ✅ **Reading a schematic** — `/learn/reference/electronics/schematic-symbols` (shipped earlier in Milestone 0)
- ✅ **Safety around AC and high current** — `/learn/reference/electronics/ac-safety`

---

## Glossary

### 🟢 Phase 1

- 🟢 **Glossary infrastructure** — `glossary.ts` with ~20 entries covering
  every term used in the existing three lessons + the Phase 1 reference
  pages.
- 🟢 **`<Term>` component** — renders an inline link with a Base UI popover
  showing the blurb.
- 🟢 **Glossary index page** at `/learn/glossary` — lists every entry,
  auto-generated from `GLOSSARY`.

### 🟡 Phase 2

- 🟡 **Grow glossary in lockstep with Phase 2 lessons and reference pages.**
  Every new concept that's referenced from more than one lesson gets an
  entry.

### 🔵 Phase 3

- 🔵 **Backlinks** — the glossary page shows "Referenced in these lessons"
  for each term. Built at compile time by scanning lesson files for
  `<Term k="…">` calls.
- 🔵 **Related terms** — the `related: GlossaryKey[]` field surfaces "See
  also" on the glossary index and in each popover.

### ⚫ Phase 4

- ⚫ **Command palette integration** — feed the glossary into the existing
  [`command-palette.tsx`](../components/command-palette.tsx) so `Cmd+K` can
  jump to any term's canonical page.
- ⚫ **Glossary JSON export** — a Node script that emits `glossary.json` for
  consumption by external tools / agents.
- ⚫ **Internationalisation** — swap `blurb: string` for
  `blurb: Record<Locale, string>` when translations become necessary.

---

## Navigation / IA

### 🟢 Phase 1

- 🟢 **Sidebar restructure** — four groups: Lessons, Arduino Uno Reference,
  Arduino Programming, Electronics Fundamentals. Each group is a collapsible
  section showing its pages. Alphabetical within a group except Lessons,
  which keeps its curated order.
- 🟢 **"Canonical home" rule enforced** — every cross-track concept lives on
  exactly one page; the other tracks link to it via the glossary. Document
  this in [`AUTHORING.md`](./AUTHORING.md).

### 🟡 Phase 2

- 🟡 **Progress indicator on lessons** — "You've done X of Y" in the sidebar,
  backed by `localStorage`.
- 🟡 **"See also" block at the bottom of every page** — hand-curated list of
  related topics across tracks.

### 🔵 Phase 3

- 🔵 **Search across all learn content** — client-side index built at
  compile time from page frontmatter.
- 🔵 **"What you'll need to know" preamble** on each lesson — auto-generated
  list of Phase 1 reference pages the lesson assumes.

---

## Cross-cutting concerns

### 🟢 Phase 1

- 🟢 **Reference pages share the same layout primitives as docs and lessons**
  (`<Section>`, `<Note>`, `<Warn>`, `<CodeBlock>`, `<Table>`, `<PageTitle>`).
  Do not introduce a new primitive vocabulary per track.
- 🟢 **One concept, one page.** Enforce this in review. "PWM basics and
  `analogWrite`" is two pages. "What a pot is and how to read it" is two
  pages.
- 🟢 **Every page answers one question.** Title is the question; subtitle
  is the one-sentence answer.

### 🟡 Phase 2

- 🟡 **Consistent diagram style** — decide on a single way to draw circuits
  (schematic SVG? breadboard view? both?) and stick to it across tracks.
- 🟡 **All reference pages build a list of "referenced by lessons"
  automatically** (reuses the backlinks infrastructure from glossary
  Phase 3).

### 🔵 Phase 3

- 🔵 **Dark/light theming consistency audit** once all Phase 1 pages exist.
- 🔵 **Accessibility audit** — popover keyboard nav, heading hierarchy,
  contrast on diagrams.

---

## Shipping plan summary

**Phase 1** (the 🟢 items) is the minimum-viable expansion — about
20 reference pages, a glossary with ~20 entries, the `<Term>` component,
sidebar restructure, and 3 new lessons. Cohesive enough to ship as "Dreamer
now has a real learning section."

**Phase 2** (the 🟡 items) grows naturally as you write new lessons —
each new lesson either reuses Phase 1 references or adds a Phase 2 one.

**Phase 3** (the 🔵 items) is "nice to have" — wait for user demand or a
specific lesson that needs the topic.

**Phase 4** (the ⚫ items) is "only if asked." Do not preemptively build
these or they'll rot as stub pages.

The biggest risk to this plan is the temptation to write Phase 1+2+3 at
once. Don't — incomplete reference sections are worse than small complete
ones. Ship Phase 1 end-to-end before touching Phase 2.

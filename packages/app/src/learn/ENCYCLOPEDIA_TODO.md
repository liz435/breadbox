# /learn — Encyclopedia Build Plan (Actionable TODO)

Goal: ship three fully browsable encyclopedias inside the existing `/learn`
shell — **Arduino Uno Reference**, **Arduino Programming**, **Electronics
Fundamentals** — with a collapsible tabbed sidebar and schematic diagrams
where they earn their keep.

This is the actionable checklist. Every box is one PR-sized unit of work.
Check a box when the work lands.

**Status:** Milestones 0, 1, 2, 3 complete; Phase 2 + Phase 3
encyclopedia batches complete. **86 encyclopedia pages live** across
the three tracks (15 board, 36 programming, 35 electronics). All 🟢
Phase 1, 🟡 Phase 2, and 🔵 Phase 3 encyclopedia entries are shipped
as published pages. Milestone 4 cross-linking audit is substantially
done; the remaining items need a browser (landing page redesign,
keyboard-nav smoke test, dark-mode visual audit). Phase 2 and Phase 3
**lessons** remain unshipped — lessons need hand-crafted board JSON +
verified sketch compilation, which can't be batched the same way as
pure-text encyclopedia pages.

**Phase 3 encyclopedia batch (this round):**
- 25 new pages: 4 board (i2c, spi, atmega328p, clock-power) + 12
  programming (structs, classes, multi-file, eeprom, bit-manipulation,
  shift-out-in, irremote-library, ssd1306-library, multi-sensor,
  smoothing, ui-state-machines, pin-naming) + 9 electronics
  (impedance, decoupling, transistors, voltage-regulators, relays,
  i2c-concepts, spi-concepts, one-wire, ac-safety).
- 10 new glossary entries (transistor, mosfet, relay, voltage-regulator,
  eeprom, i2c, spi, struct, impedance, decoupling).
- All registered in `encyclopedia-page-registry.ts`; all flipped to
  `"published"` in the catalog.
- Typecheck clean.

## Quick rules of engagement

- **Order is load-bearing.** Do Milestone 0 (infrastructure) before
  Milestone 1 (content). If you write content first you'll throw it away
  when the shell changes.
- **One box = one PR.** Don't batch multiple infrastructure changes or
  multiple pages into a single commit. This TODO is the merge plan.
- **Diagrams only when they earn their keep.** Most pages need zero
  diagrams. A few need one. No page needs five.
- **Keep the layout primitive vocabulary.** `<PageTitle>`, `<Section>`,
  `<Note>`, `<Warn>`, `<CodeBlock>`, `<Table>` from
  [`docs-layout.tsx`](../docs/docs-layout.tsx). Don't invent new ones.
- **Every page answers one question.** If it answers two, split it.

---

## Milestone 0 — Infrastructure (do this first)

Nothing in Milestones 1–3 will hold up without these. Order inside this
milestone matters too.

### 0.1 Routing & page registry

- [x] **Create [`encyclopedia/`](./encyclopedia/) directory** next to
  [`lessons/`](./lessons/) with three subdirectories: `board/`, `programming/`,
  `electronics/`.
- [x] **Create `encyclopedia-catalog.ts`** in `learn/` that exports the full
  topic manifest. Shape:
  ```ts
  export type EncyclopediaEntry = {
    slug: string              // URL segment, kebab-case
    track: "board" | "programming" | "electronics"
    group: string             // sidebar subgroup (see 0.3)
    title: string             // page <PageTitle> title
    summary: string           // one-line description for the sidebar hover
    status: "planned" | "draft" | "published"
  }
  export const ENCYCLOPEDIA: readonly EncyclopediaEntry[] = [ /* … */ ]
  ```
  Seed it with every topic from Milestones 1–3. Status starts at `"planned"`
  for every entry; flip to `"published"` as pages ship. Pages with status
  `"planned"` are hidden from the sidebar unless the user opens the catalog
  with a query flag (avoids a sea of 404s).
- [x] **Add routes to [`learn-router.tsx`](./learn-router.tsx)** for every
  published entry. URL shape: `/learn/reference/board/<slug>`,
  `/learn/reference/programming/<slug>`, `/learn/reference/electronics/<slug>`.
  Router reads the catalog — no hand-maintained route table duplication.
  *Deviation:* page components live in a separate
  [`encyclopedia-page-registry.ts`](./encyclopedia-page-registry.ts) to
  break an import cycle (catalog → page → encyclopedia-layout →
  learn-layout → catalog).
- [x] **Add a 404-style `EncyclopediaNotFound`** for `/learn/reference/…`
  paths not in the catalog. Explains the `?showPlanned=1` escape hatch
  for previewing registered-but-unwritten entries.

### 0.2 Sidebar — collapsible groups

- [x] **Replace the flat sidebar in
  [`learn-layout.tsx`](./learn-layout.tsx)** with a nested, collapsible
  structure. Top level has four groups:
  1. Lessons (existing)
  2. Arduino Uno Reference
  3. Arduino Programming
  4. Electronics Fundamentals
- [x] **Use `@base-ui/react/accordion`** with array-valued `value` so
  groups expand independently. Do NOT use `<details>` — Base UI gives
  you controlled state, keyboard nav, and ARIA for free.
- [x] **Persist the open/closed state per group** in `localStorage`.
  *Deviation:* split into two keys (`dreamer:learn-sidebar:top` and
  `dreamer:learn-sidebar:group`) so expanding a subgroup doesn't
  force-open its track and vice-versa.
- [x] **Nested subgroups inside each track.** Two levels deep — top
  accordion per track, second accordion per subgroup.
- [x] **Active-page highlight** inherits from the existing lesson
  sidebar styling but uses a per-track color: emerald for Lessons,
  blue for Board, purple for Programming, amber for Electronics. Colors
  live on [`TRACKS`](./encyclopedia-catalog.ts) metadata.
- [x] **Group header chevron** rotates on open/close via
  `data-[panel-open]:rotate-90`. No manual state tracking.
- [ ] **Mobile behaviour.** Sidebar becomes a drawer on narrow viewports
  (< 768px). Out of scope for first pass if the app isn't already
  responsive at that breakpoint — leave a TODO comment and link to this
  line.

### 0.3 Page shell & helpers

- [x] **Create [`encyclopedia-layout.tsx`](./encyclopedia-layout.tsx)**
  — re-exports every primitive encyclopedia pages need (`LearnLayout`,
  `PageTitle`, `Section`, `Note`, `Warn`, `CodeBlock`, `Table`,
  `Badge`, `Schematic`, `Figure`) so each page has one import line.
  *Deviation:* the sidebar nesting lives in `learn-layout.tsx`
  directly since it's shared between lessons and encyclopedia pages.
- [x] **Add `<PrevNextFooter>`** component. Walks entries within the
  same track, skipping `planned` siblings so readers only ever see
  links to pages that exist.
- [x] **Add `<SeeAlso>`** component. Takes typed
  ``${track}/${slug}`` refs; silently drops refs to planned entries
  so cross-links can land before their target pages.
- [x] **Extend [`AUTHORING.md`](./AUTHORING.md)** with an "Encyclopedia
  pages" section covering: file location, the catalog entry, page
  structure, when to add a diagram, when to add a code block, when to
  use `<Note>` vs `<Warn>` vs prose.

### 0.4 Schematic / diagram primitive

- [x] **Create [`schematic.tsx`](./schematic.tsx)** exporting a lightweight
  `<Schematic>` component. Philosophy:
  - Inline SVG, no external image files. Pages stay self-contained and
    dark-mode-correct.
  - Standard 2D canvas with a fixed 16-column grid. Components are small
    SVG symbols positioned on the grid. Wires are polylines between grid
    points.
  - Expose a tiny DSL so page authors don't hand-draw `<path>`:
    ```tsx
    <Schematic cols={16} rows={10}>
      <Schematic.Resistor from={[2, 4]} to={[6, 4]} label="220Ω" />
      <Schematic.Led at={[8, 4]} color="red" />
      <Schematic.Wire points={[[6,4],[8,4]]} />
      <Schematic.Ground at={[8, 8]} />
      <Schematic.Vcc at={[0, 4]} label="5V" />
    </Schematic>
    ```
  - Symbols shipped: `Resistor`, `Led`, `Button`, `Capacitor`,
    `Battery`, `Vcc`, `Ground`, `Wire`, `Junction`, `Label`, `ArduinoPin`.
    *Post-ship polish:* `Led`, `ArduinoPin`, and `Battery` were reworked
    to use two-terminal (`from`/`to`) conventions so wires connect
    exactly at grid points — the original single-`at` versions had
    half-cell lead extensions that caused visible gaps.
  - Symbols match ANSI/IEC conventions. No bespoke icons.
- [x] **Document the component symbol palette** as a self-demoing page
  at [`/learn/reference/electronics/schematic-symbols`](./encyclopedia/electronics/schematic-symbols.tsx).
  Doubles as a visual regression reference for the `<Schematic>`
  primitive itself.
- [x] **Add `<Figure>`** wrapper that places a schematic inside a
  captioned container with consistent spacing.
- [x] **Do NOT build a breadboard-view primitive.** (Decision held.)
  The existing `<BreadboardEmbed>` already shows breadboard layouts
  for lessons; encyclopedia pages use schematics.

### 0.5 Glossary integration (optional but recommended)

- [x] **Create [`glossary.ts`](./glossary.ts)** — 23 entries covering
  the terms the existing lessons plus Phase-1 encyclopedia concepts
  use. Uses `as const satisfies Record<string, GlossaryEntry>` so the
  key union is tight and renames are compile errors.
- [x] **Create [`<Term k="…">`](./term.tsx) component** with a Base UI
  popover. Shows the blurb on hover and navigates to `entry.href` on
  click (if set).
- [x] **Update [`AUTHORING.md`](./AUTHORING.md)** with a "Linking
  terms" section (folded into the new "Encyclopedia pages" section).

### 0.6 Command palette (Cmd+K) — added after original plan

- [x] **Create [`learn-command-palette.tsx`](./learn-command-palette.tsx)**
  — scoped Cmd+K palette mounted by `LearnLayout`. Commands pulled
  from: LESSONS list, published catalog entries (auto-derived), and
  glossary terms with `href`. Fuzzy-match scoring mirrors the
  editor's palette so muscle memory carries over.

Milestone 0 is **DONE**:
- [x] A reader can navigate to `/learn/reference/board/...` and see a
  stub (or real) page rendered through the new layout.
- [x] The sidebar shows four collapsible groups, remembers its state,
  and highlights the active page.
- [x] A test page (`electronics/schematic-symbols`) renders every
  `<Schematic>` DSL symbol correctly in dark mode.
- [x] Cmd+K opens a search palette across all three tracks + lessons
  + glossary.

---

## Milestone 1 — Arduino Uno Reference (board track) 🟢

**Sidebar subgroups** (reflect these as nested collapsibles):

- **The board** — board-wide facts
- **Pins & I/O** — what's on the headers
- **Communication** — serial, I2C, SPI
- **Signals & timing** — PWM, interrupts, timers

Each page gets a `SeeAlso` block linking to at least one other track.

### The board

- [x] **[`/learn/reference/board/anatomy`](./encyclopedia/board/anatomy.tsx)** — Board anatomy
  - Labeled SVG of the Uno with 11 callouts (USB, barrel jack, ICSP,
    reset, onboard LEDs, pin headers, ATmega, crystal, regulator).
    Hand-drawn inline SVG via a dedicated `<UnoTopDownDiagram>` — not
    the `<Schematic>` DSL, since that's for circuits.
  - `SeeAlso`: powering, onboard LED, digital/analog/power pins.

- [x] **[`/learn/reference/board/powering`](./encyclopedia/board/powering.tsx)** — Powering the Arduino
  - USB, VIN, barrel jack — three-column comparison table. How the
    linear regulator works (heat dissipation math, dropout below 7 V).
    Current limits table (per-pin, per-port, chip-total, 5V pin).
    Decision tree for common "how do I power this?" scenarios.
  - No schematic — text + two tables carry it.

- [x] **[`/learn/reference/board/onboard-led`](./encyclopedia/board/onboard-led.tsx)** — The onboard LED on pin 13
  - Why it exists (practical + historical), `LED_BUILTIN` macro
    pattern, gotchas about pin 13 being shared with the header + SPI
    clock + weak pull-down from the onboard LED/resistor.
  - *Deviation from plan:* includes one `<Schematic>` figure showing
    the onboard wiring, because the gotcha section references
    physical connectivity and the schematic clarifies it faster than
    prose could.

### Pins & I/O

- [x] **`/learn/reference/board/digital-pins`** — Digital pins D0–D13
  - What they do, PWM-capable pins (3, 5, 6, 9, 10, 11), special pins
    (0/1 = RX/TX; 13 = onboard LED).
  - Schematic? No schematic — a prose "not all pins are equal" table
    carries the explanation with less visual noise than a silkscreen
    diagram would.
  - `SeeAlso`: analog pins, PWM, interrupts, onboard LED,
    programming/digital-io, electronics/pull-ups.

- [x] **`/learn/reference/board/analog-pins`** — Analog pins A0–A5
  - 10-bit ADC, 0–1023, voltage reference, dual-use as digital pins
    14–19. Why you use them with potentiometers and sensors.
  - Schematic? **Yes — one figure**: a potentiometer wired as a
    voltage divider into A0.
  - `SeeAlso`: digital pins, PWM, programming/analog-io, voltage
    dividers, electronics/pwm.

- [x] **`/learn/reference/board/power-pins`** — Power pins
  - 5V, 3.3V, GND, VIN, RESET, IOREF. What each supplies, safe
    sourcing, the "never feed power into the 5V pin" warning.
  - Schematic? **No.** One reference table + prose.
  - `SeeAlso`: powering, anatomy, electronics/power, electronics/ground,
    electronics/shorts.

- [x] **`/learn/reference/board/shield-headers`** — Pin header layout
  - Maps digital/analog/power headers to physical positions. Lets
    readers plan layouts on a real board.
  - Schematic? **Yes — one figure**: stylized top-down of the Uno
    showing the four header strips with pin labels.
  - `SeeAlso`: anatomy, digital pins, analog pins, power pins,
    electronics/breadboards.

### Signals & timing

- [x] **`/learn/reference/board/pwm`** — PWM on the Uno
  - Which 6 pins support it, default frequency (490 Hz / 980 Hz),
    conceptual link to the electronics PWM page.
  - Schematic? **Yes — one figure**: custom SVG duty-cycle timing
    diagram showing 0% / 50% / 100%.
  - `SeeAlso`: programming/analog-io, electronics/pwm.

- [x] **`/learn/reference/board/interrupts`** — Hardware interrupts
  - Pin 2 (INT0) and pin 3 (INT1). RISING / FALLING / CHANGE / LOW
    modes. When to use them instead of polling.
  - Schematic? **No.**
  - `SeeAlso`: board/digital-pins, programming/timing.

- [x] **`/learn/reference/board/timers`** — Timers on the Uno
  - Conceptual only. Why `delay()` blocks, why `millis()` doesn't,
    the three hardware timers.
  - Schematic? **No.**
  - `SeeAlso`: programming/timing, programming/non-blocking-timing.

### Communication

- [x] **`/learn/reference/board/serial`** — Serial (USB)
  - What the serial monitor is, baud rate, pins 0/1, when to use it.
  - Schematic? **No.**
  - `SeeAlso`: programming/serial-api, board/digital-pins.

### Phase 2 for this track (not blocking Milestone 1 sign-off)

- [ ] `/learn/reference/board/i2c` — I2C on A4/A5 (after an I2C lesson lands)
- [ ] `/learn/reference/board/spi` — SPI pinout + ICSP header
- [ ] `/learn/reference/board/atmega328p` — ATmega chip overview
- [ ] `/learn/reference/board/uno-vs-others` — Uno vs Mega / Nano / ESP32

**Milestone 1 — DONE.** Every 🟢 box above is checked. The board group
appears in the sidebar with working links, every page renders its
`<PrevNextFooter>` and `<SeeAlso>`, and all 11 pages are live under
`/learn/reference/board/*`.

---

## Milestone 2 — Arduino Programming (coding track) 🟢

**Sidebar subgroups**:

- **C++ essentials** — what language features you can use
- **Arduino API** — the functions you'll actually call
- **Libraries** — the classes the simulator ships
- **Patterns** — idioms that separate beginner from intermediate
- **Limits** — what Dreamer can and can't run

### C++ essentials

- [x] **`/learn/reference/programming/sketch-structure`** — Sketch structure
- [x] **`/learn/reference/programming/variables`** — Variables and types
- [x] **`/learn/reference/programming/operators`** — Operators
- [x] **`/learn/reference/programming/control-flow`** — Control flow
- [x] **`/learn/reference/programming/functions`** — Functions
- [x] **`/learn/reference/programming/constants`** — Constants and `#define`
- [x] **`/learn/reference/programming/comments`** — Comments

### Arduino API (organized by purpose, not alphabetically)

- [x] **`/learn/reference/programming/digital-io`** — Digital I/O
  - Schematic: button with INPUT_PULLUP wiring.
- [x] **`/learn/reference/programming/analog-io`** — Analog I/O
- [x] **`/learn/reference/programming/timing`** — Timing
- [x] **`/learn/reference/programming/serial-api`** — Serial API

### Libraries

- [x] **`/learn/reference/programming/servo-library`** — Servo library
  - Schematic: servo signal/VCC/GND wiring.

- [ ] **`/learn/reference/programming/liquidcrystal-library`** (Phase 2)
- [ ] **`/learn/reference/programming/neopixel-library`** (Phase 2)
- [ ] **`/learn/reference/programming/dht-library`** (Phase 2)

### Patterns

- [x] **`/learn/reference/programming/non-blocking-timing`** — `millis()`
  instead of `delay()`

- [ ] **`/learn/reference/programming/debounce`** (Phase 2)
- [ ] **`/learn/reference/programming/state-machines`** (Phase 2)

### Limits

- [x] **`/learn/reference/programming/dreamer-limits`** — What Dreamer
  can and can't run
  - Pointers and references rejected by design, no `malloc`/`new`, no
    register access, partial multi-file support, no templates.
  - `SeeAlso`: custom libraries (extending doc in /documentation),
    transpiler source ([`arduino-transpiler.ts`](../simulator/arduino-transpiler.ts)).

**Milestone 2 — DONE.** Every 🟢 box above is checked and the
programming group is fully populated in the sidebar (15 pages).

---

## Milestone 3 — Electronics Fundamentals (physics track) 🟢

**Sidebar subgroups**:

- **Core concepts** — V / I / R, Ohm's law, series vs parallel, etc.
- **Components** — the physical reality behind each part
- **Signals** — analog vs digital, voltage dividers, PWM
- **Practical** — current limits, common mistakes, reading schematics

This is the track that benefits most from schematics. Budget carefully:
every concept page should have **at most one** schematic, and only if it
makes the explanation shorter than prose would.

### Core concepts

- [x] **`/learn/reference/electronics/voltage-current-resistance`** —
  Voltage, current, resistance
- [x] **`/learn/reference/electronics/ohms-law`** — Ohm's law
  - Schematic: LED + resistor example.
- [x] **`/learn/reference/electronics/power`** — Power and current limits
- [x] **`/learn/reference/electronics/series-parallel`** — Series vs parallel
  - Schematic: side-by-side series + parallel resistor pairs.
- [x] **`/learn/reference/electronics/ground`** — Ground is a reference
  - Schematic: voltmeter placement example.
- [x] **`/learn/reference/electronics/shorts`** — Short circuits
  - Schematic: annotated red short from +V to GND.

### Components

- [x] **`/learn/reference/electronics/resistors`** — Resistors
- [x] **`/learn/reference/electronics/leds`** — LEDs
  - Schematic: LED + series resistor example.
- [x] **`/learn/reference/electronics/breadboards`** — Breadboards
- [x] **`/learn/reference/electronics/wires`** — Wires and jumpers

- [ ] **`/learn/reference/electronics/switches`** (Phase 2)
- [ ] **`/learn/reference/electronics/potentiometers`** (Phase 2)
- [ ] **`/learn/reference/electronics/capacitors`** (Phase 2)
- [ ] **`/learn/reference/electronics/diodes`** (Phase 2)

### Signals

- [x] **`/learn/reference/electronics/pwm`** — PWM as "fake analog"
  - Canonical home for PWM. Custom SVG timing diagram showing
    0%/50%/100% duty cycles over time.

- [ ] **`/learn/reference/electronics/analog-vs-digital`** (Phase 2)
- [ ] **`/learn/reference/electronics/voltage-dividers`** (Phase 2)
- [ ] **`/learn/reference/electronics/pull-ups`** (Phase 2)

### Practical

- [x] **`/learn/reference/electronics/beginner-mistakes`** — Common
  beginner mistakes
  - Four tiny mistake schematics (reverse polarity, missing resistor,
    shorts, forgetting shared ground).

- [x] **`/learn/reference/electronics/schematic-symbols`** — Reading a
  schematic (shipped in Milestone 0 as the `<Schematic>` DSL visual
  regression reference).

**Milestone 3 — DONE.** Every 🟢 box above is checked and the
electronics group is fully populated in the sidebar (13 pages).

---

## Milestone 4 — Cross-linking & polish

Do this only after Milestones 0–3 are complete. Trying to do it earlier
means rework.

- [x] **Glossary audit.** 20 of the 38 encyclopedia pages wrap their
  key concepts in `<Term k="…">` (pages without any wrap are the
  ones that don't reference glossary-worthy terms, e.g.
  `programming/comments`). Terms were added inline as each page
  was written rather than in a separate pass.
- [x] **`SeeAlso` audit.** Every shipped page already includes a
  hand-curated `<SeeAlso>` block written as part of the page itself.
  Every block was hand-picked to include at least one cross-track
  reference. Not auto-generated.
- [x] **Existing lesson audit.** All three existing lessons
  ([`blink-led`](./lessons/blink-led.tsx),
  [`button-led`](./lessons/button-led.tsx),
  [`fade-led`](./lessons/fade-led.tsx)) now wrap their key concepts
  in `<Term>` pointing at the corresponding encyclopedia pages
  (led, resistor, pin-mode, digital-write, button, pull-up,
  input-pullup, ground, digital-read, pwm, duty-cycle,
  analog-write, ohms-law). Prose untouched — just links added.
- [x] **Status audit.** All 39 shipped entries in
  `encyclopedia-catalog.ts` are now `"published"`. Remaining
  `"planned"` entries are Phase 2 topics that are correctly hidden
  from the sidebar by default.
- [ ] **Landing page for `/learn`.** Update the current stub to show a
  short welcome + four cards (Lessons, Board Reference, Programming
  Reference, Electronics Reference) each linking into that group's first
  page.
- [ ] **Sidebar keyboard navigation test.** Tab through the sidebar, arrow
  keys inside an open group, `Enter` to activate. Base UI handles this
  mostly for free but smoke-test it.
- [ ] **Dark-mode audit.** Inline SVG diagrams use hardcoded colors.
  Verify every schematic is legible on the `#0f0f0f` background.
- [x] **Update [`AUTHORING.md`](./AUTHORING.md)** with the final
  encyclopedia authoring workflow. Done as part of Milestone 0 —
  the "Encyclopedia pages" section covers file locations, the
  catalog entry + page registry split, the standard page shape,
  schematic budget rules, `<Term>` usage, `<SeeAlso>` rules, and
  the non-obvious design decisions.
- [ ] **Update [`LEARN_TOPICS.md`](./LEARN_TOPICS.md)** to mark Phase 1
  items that now exist as 🟢 → ✅.

---

## Non-goals (explicitly out of scope for this plan)

Say no to these now so you don't drift.

- ⛔ **Server-rendered docs.** Everything is client-side React. No MDX, no
  SSG.
- ⛔ **User-editable content.** The glossary and encyclopedia are TypeScript
  source. No CMS.
- ⛔ **Versioned content.** No "v1 vs v2 of the Arduino reference."
- ⛔ **Per-user progress tracking on encyclopedia pages.** Lessons have this
  (future); encyclopedias are reference material and don't need it.
- ⛔ **Auto-generated API pages.** Every page is hand-written so the
  narrative stays high quality.
- ⛔ **A breadboard-view primitive for encyclopedia pages.** The existing
  `<BreadboardEmbed>` covers lesson use. Encyclopedias use schematics.
- ⛔ **Inline interactive circuits in encyclopedia pages (at first).** If a
  topic needs interaction, write a lesson for it and link from the
  encyclopedia page.
- ⛔ **Full i18n.** Blurbs are English-only for now. The glossary design
  admits a later migration to `Record<Locale, string>`; don't pre-build.

---

## Estimation & sequencing

- **Milestone 0** is ~1–2 days of infrastructure work for one engineer.
  Nothing in 1–3 compiles without it.
- **Milestone 1** is ~10 pages. Budget a page at 45–90 minutes if you have
  the source material; longer if you're researching. Realistic: 1.5–2 days.
- **Milestone 2** is ~15 pages but most are short references. Budget 2
  days.
- **Milestone 3** is the most work: ~12 pages, most with schematics. The
  `<Schematic>` DSL pays for itself here but every figure still takes
  time. Budget 2–3 days.
- **Milestone 4** is ~1 day.

Total: about 1.5 weeks of focused work. Do not attempt to compress this
by skipping Milestone 0.

---

## Definition of done for the whole encyclopedia effort

- Every 🟢 checkbox in Milestones 0–4 is ticked.
- The sidebar shows four groups. Three of them are the new encyclopedias
  with nested sub-groups. All groups are collapsible and persist state.
- Every encyclopedia page has a title, a subtitle that answers the
  page's question in one sentence, at least one `<Section>`, a
  `<SeeAlso>` block, and a `<PrevNextFooter>`.
- Every page with a circuit example has exactly one schematic (or zero
  if prose is clearer). None has more than three.
- The three existing lessons link into the encyclopedia via `<Term>`.
- [`LEARN_TOPICS.md`](./LEARN_TOPICS.md) is updated to reflect what
  shipped.
- Typecheck passes. No regressions in existing lessons.

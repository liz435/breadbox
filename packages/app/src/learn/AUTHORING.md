# /learn — Authoring Guide

This directory owns the interactive lesson experience at `/learn/*`. This
document is a contributor reference. If you're adding a new lesson, editing
an existing one, or touching the embed plumbing, start here.

## Goals

- **Every lesson is self-contained.** One TSX file renders prose + an
  embedded, auto-starting simulator for that lesson's board.
- **Boards are data, not code.** A board is just a JSON snapshot of the
  editor's `BoardState`. You build it in the real editor, dump the state,
  and save it as a file under [`boards/`](./boards/).
- **"Drop a file" is the happy path.** The catalog picks up new JSON via
  `import.meta.glob`, so the only wiring is: JSON file → lesson TSX → one
  route entry → one sidebar entry. No schema migrations, no build steps.
- **Prose stays small.** Each lesson is a few paragraphs around one
  interactive idea. Keep it under a couple of screenfuls.

## Directory map

```
packages/app/src/learn/
├── AUTHORING.md                  ← you are here
├── LEARN_TOPICS.md               ← full topic roadmap by urgency
├── ENCYCLOPEDIA_TODO.md          ← milestone build plan for the reference tracks
├── learn-router.tsx              ← dispatches /learn/<slug> and /learn/reference/<track>/<slug>
├── learn-layout.tsx              ← shell, expanded sidebar, LESSONS catalog
├── learn-command-palette.tsx      ← Cmd+K fuzzy search across lessons/pages/glossary
├── breadboard-embed.tsx          ← <BreadboardEmbed> + side panels + controls
├── board-catalog.ts              ← eager glob of ./boards/*.json
├── encyclopedia-catalog.ts       ← metadata-only list of all reference pages
├── encyclopedia-page-registry.ts ← resolves track/slug → React page component
├── encyclopedia-layout.tsx       ← PrevNextFooter + SeeAlso + primitive re-exports
├── schematic.tsx                 ← <Schematic> DSL + <Figure> wrapper
├── glossary.ts                   ← typed glossary (source of truth for <Term>)
├── term.tsx                      ← <Term k="…"> inline glossary link
├── boards/                       ← lesson board snapshots (BoardState JSON)
│   ├── 01-blink-led.json
│   ├── 02-button-led.json
│   └── 03-fade-led.json
├── lessons/                      ← lesson pages (one TSX per lesson)
│   ├── blink-led.tsx
│   ├── button-led.tsx
│   └── fade-led.tsx
└── encyclopedia/                 ← reference pages grouped by track
    ├── planned-page.tsx          ← placeholder for unshipped entries
    ├── board/                    ← Arduino Uno Reference (15 pages)
    ├── programming/              ← Arduino Programming (36 pages)
    └── electronics/              ← Electronics Fundamentals (35 pages)

packages/app/src/examples/
├── example-catalog.ts            ← metadata + glob for example boards
└── boards/                       ← 21 example board JSONs (one per component type)
    ├── ex-led.json
    ├── ex-button.json
    ├── ex-servo.json
    └── … (21 files total)

packages/app/src/editor/
├── sketch-editor.tsx             ← CodeMirror editor + toolbar (Run/Stop/Examples)
└── example-button.tsx            ← "Examples" popover in the sketch toolbar
```

The routing entry point is [`app.tsx`](../app.tsx) — `/learn` is dispatched
there to `<LearnRouter>`.

## Adding a new lesson — checklist

This is the full set of files you need to touch for a brand-new lesson.

1. **Build the circuit in the editor.** Open `/editor`, place components,
   draw wires, write the sketch, verify it runs. This is by far the best
   way to author the board state — you get live visual feedback and the
   real simulator catches bugs before you commit them to a JSON file.

2. **Dump the board state to JSON.** Two options:
   - **From the live project file.** Locate the project file under
     `packages/api/data/projects/<uuid>.json`, copy the `boardState` object
     (just that key's value), and paste it into a new file in `boards/`.
   - **From devtools.** In the running editor, copy from the board actor
     context:
     ```js
     // Browser devtools console on /editor
     const ctx = /* your board actor */.getSnapshot().context
     copy(JSON.stringify({
       components: ctx.components,
       wires: ctx.wires,
       sketchCode: ctx.sketchCode,
       customLibraries: ctx.customLibraries,
       libraryState: ctx.libraryState,
       serialOutput: [],
     }, null, 2))
     ```
   Save the result as `boards/<NN>-<slug>.json` where `NN` is the
   sort-order prefix (keeps lessons ordered in the sidebar) and `<slug>`
   matches your lesson URL.

3. **Create the lesson page.** Copy [`lessons/blink-led.tsx`](./lessons/blink-led.tsx)
   to `lessons/<slug>.tsx` and rewrite the prose + adjust props. The
   minimum lesson file looks like:

   ```tsx
   import { LearnLayout, LessonFooter, PageTitle, Section, Note } from "@/learn/learn-layout"
   import { BreadboardEmbed } from "@/learn/breadboard-embed"

   export function MyLesson() {
     return (
       <LearnLayout>
         <PageTitle title="…" subtitle="…" />

         <Section title="What you'll build">
           <p className="text-sm leading-relaxed">…</p>
         </Section>

         <Section title="Try it">
           <BreadboardEmbed board="04-my-lesson" panels={["code"]} height={440} />
         </Section>

         <Section title="How it works">
           <p className="text-sm leading-relaxed">…</p>
         </Section>

         <LessonFooter currentSlug="my-lesson" />
       </LearnLayout>
     )
   }
   ```

4. **Register the route** in [`learn-router.tsx`](./learn-router.tsx):
   ```ts
   import { MyLesson } from "@/learn/lessons/my-lesson"
   // …
   const ROUTES = {
     // …
     "/learn/my-lesson": MyLesson,
   }
   ```

5. **Register the sidebar entry** in the `LESSONS` array in
   [`learn-layout.tsx`](./learn-layout.tsx):
   ```ts
   export const LESSONS = [
     // …
     {
       slug: "my-lesson",
       board: "04-my-lesson",
       title: "My Lesson Title",
       summary: "One-line summary shown in the sidebar.",
     },
   ] as const
   ```
   The order of this array is the order of the sidebar and of the
   "Next" link at the bottom of each lesson.

6. **Verify.** `bun run typecheck`, open `/learn/my-lesson` in the app,
   click Play, confirm the circuit runs as expected.

That's the entire checklist. No other files should need changes.

## Writing a lesson page

### Available primitives

These are re-exported from [`learn-layout.tsx`](./learn-layout.tsx) (they
live in `docs-layout.tsx` so lessons and component docs share one
vocabulary):

| Primitive | Use for |
|---|---|
| `<PageTitle title subtitle>` | Page header. Always the first child. |
| `<Section title>` | A titled prose block. Group every paragraph in one. |
| `<Note>` | Friendly aside — tips, clarifications. Rendered with a neutral box. |
| `<Warn>` | Things the reader should pay attention to (polarity, safety). |
| `<CodeBlock code lang>` | Fenced code sample. `lang` defaults to `cpp`. |
| `<Table headers rows>` | Simple two+ column reference table. |
| `<Badge variant>` | Status tag. Variants: `implemented`, `partial`, `not-implemented`. Usually only used in component docs, not lessons. |
| `<LessonFooter currentSlug>` | Renders the "Next lesson" button. Pass the current lesson's slug. Always the last child. |

### Structure that works

The lessons that land well follow this arc:

1. **`What you'll build`** — one paragraph describing the visible outcome
   (what the LED/servo/display will do), not the code.
2. **`Try it`** — the `<BreadboardEmbed>` + a `<Note>` telling the reader
   to press Play.
3. **`How it works`** — one or two short paragraphs explaining the sketch
   behaviour, broken down by `setup()` vs `loop()`.
4. **`Why …?`** — optional section explaining *one* non-obvious choice
   (why a resistor, why `INPUT_PULLUP`, why PWM, etc.). Pick the most
   confusing part and address only that.

Keep each `<Section>` to 1–3 short paragraphs. If a section is getting
long, it's probably two sections.

### Inline code style

- Variable names, pin numbers, and function names in prose get an inline
  `<code>` tag styled the same way as the docs pages:
  ```tsx
  <code className="text-gray-200">pinMode(13, OUTPUT)</code>
  ```
- Use `<CodeBlock>` for anything that's more than a single expression.
- Don't duplicate the entire sketch in the prose — the `code` panel in
  the embed already shows it. Quote only the lines being discussed.

## `<BreadboardEmbed>` reference

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `board` | `string \| BoardState` | — | Catalog key (filename without `.json`) or inline state. Catalog key is strongly preferred. |
| `panels` | `EmbedPanel[]` | `[]` | Side panels to render. Any of `"code"`, `"schematic"`, `"serial"`. Panels stack vertically in a 320px-wide column on the right. |
| `height` | `number` | `420` | Pixel height of the whole embed. Bump it when the circuit is tall or when you're showing multiple side panels. |
| `autoRun` | `boolean` | `true` | Start the simulator as soon as the embed mounts. Set to `false` if you want the reader to click Play themselves. |
| `title` | `string` | — | Optional title chip rendered in the top-left corner of the embed. |
| `hideOpenInIde` | `boolean` | `false` | Hide the "Open in IDE →" link in the controls bar. The link only appears when `board` is a catalog key, not an inline state. |

### Panel recommendations

- **`["code"]`** — default for almost every lesson. The reader needs to
  see the sketch to understand what's running.
- **`["code", "serial"]`** — lessons where the sketch prints debug
  output (`Serial.print`), e.g. sensor reads, debugging loops.
- **`["code", "schematic"]`** — lessons where the wiring topology is the
  teaching point.
- **No panels** — rare. Only when the lesson is purely about a physical
  interaction (press a button, turn a pot) and the code is incidental.

### Sizing

Rule of thumb for the `height` prop:

| Panels | Suggested `height` |
|---|---|
| no panels | `360–400` |
| one panel | `420–460` |
| two panels | `500–560` |
| three panels | `580+` |

If your circuit is physically tall (spans more than ~10 rows), add
`60–100` more. Overly-short embeds cut off the breadboard; overly-tall
ones push the prose too far down the page.

### Read-only semantics

The embed is **read-only for structural edits**: dragging components,
drawing wires, and deleting are disabled. **Component-level interactions
still work** — button presses, potentiometer sliders, sensor inspector
knobs, serial input — because those are handled inside the component
renderers, not the canvas interaction layer.

If a lesson teaches drag-and-drop placement, the embed isn't the right
tool — send the reader to the full editor via the "Open in IDE" link
instead.

## Board JSON format

Each file under `boards/` must match the `BoardState` schema from
`@dreamer/schemas`. The required fields are:

```jsonc
{
  "components": { /* record of id → BoardComponent */ },
  "wires":      { /* record of id → Wire */ },
  "sketchCode": "/* Arduino C++ source */",
  "customLibraries": {},
  "libraryState": {
    "servos": {},
    "lcd": null,
    "serialBaud": 0
  },
  "serialOutput": []
}
```

### Component shape

```jsonc
{
  "id":       "led-1",                    // unique per board
  "type":     "led",                      // see componentTypeSchema
  "name":     "LED",                      // human label
  "x":        7,                          // column (0–9 for terminal, see notes)
  "y":        5,                          // row (0–29)
  "rotation": 0,                          // 0, 1, 2, 3 = 0°, 90°, 180°, 270° CW
  "pins":     { "anode": null, "cathode": null },
  "properties": { "color": "#ef4444" }
}
```

Pin names MUST match the `defaultPins` keys declared in
[`registry.tsx`](../components/registry.tsx) for that component type.
Using wrong pin names (e.g. `pin1`/`pin2` on a resistor instead of
`a`/`b`) is a silent footgun — the schema accepts them but the inspector
and sketch generation won't find them.

### Wire shape

```jsonc
{
  "id":      "wire-d13",
  "fromRow": -999,     // -999 = "this end is an Arduino pin, not a breadboard row"
  "fromCol": 13,       // Arduino pin number (signal 0..69, board-dependent) or -1=5V, -3=GND, etc.
  "toRow":   5,        // breadboard row (0–29)
  "toCol":   3,        // breadboard col (0–9 terminal, -2/-1/10/11 rails)
  "color":   "#fbbf24"
}
```

Arduino pin numbering for wires (the `fromCol` when `fromRow === -999`):

| `fromCol` | Meaning |
|---|---|
| `0..69` | Signal pins (board-dependent; Uno/Nano/Mega layouts differ) |
| `-1` | 5V |
| `-2` | 3V3 |
| `-3`, `-4`, `-6` | GND |
| `-5` | VIN |

Breadboard columns: cols `0..4` are the left terminal strip, `5..9` are
the right terminal strip, separated by the center gap. Cols `-2`, `-1`,
`10`, `11` are the power rails.

### Breadboard connectivity rules

Remember: **each row of 5 holes on the same side is one electrical
net.** That means:

- A component with two pins in the same row + same half is
  **shorted** — both pins are the same net. That's almost never what
  you want.
- The **resistor** footprint is a special case — it hardcodes its legs
  to col 3 (left half) and col 6 (right half) so it always straddles
  the center gap. You only pick its row, not its column.
- Every **other** multi-pin component uses a vertical footprint (each
  pin in its own row). See [`registry.tsx`](../components/registry.tsx)
  for the footprint of each type.

This is why moving an LED from col 5 to col 7 doesn't change the
electrical circuit — both are in the right half of the same row.

### Pin assignment: wires vs explicit pins

You have two ways to tell the simulator which Arduino pin a component
is on:

1. **Set `pins.<name>` directly** in the component JSON (e.g. pot's
   `pins.signal: 14`). Useful for inputs the circuit solver treats
   specially.
2. **Draw a wire** from the Arduino pin to the component's footprint
   (`fromRow: -999, fromCol: <pin>, toRow, toCol`). This is the
   preferred style for lesson boards — it's visible in the embed and
   matches how a reader would wire the circuit in real life.

Wire-based resolution is handled by `findArduinoPinsForComponent` in
[`component-pin-resolver.ts`](../breadboard/component-pin-resolver.ts).
It walks the wire graph and finds every Arduino pin electrically
connected to the component's footprint via the breadboard's internal
row buses.

## Common problems & fixes

### "Board not found: 04-my-lesson"

The catalog glob is compile-time. Restart the dev server after adding a
new JSON file.

### LED doesn't light, or pot doesn't update A0

Usually one of:

- **Missing series resistor on an LED** — the SPICE model is a
  linearized 120Ω resistor, so a bare LED across 5V and GND will draw a
  huge current and SPICE may flag it, but it'll still "work" visually.
  Always include a resistor anyway so the lesson is teaching a correct
  circuit.
- **Bad wire-traced net** — check every wire's endpoint lands on the
  component's actual footprint grid points. See
  [`registry.tsx`](../components/registry.tsx) for footprint geometry
  per component type.
- **5V and GND on the same net** — e.g. two wires landing on the same
  `toRow`/`toCol`, one from `-1` (5V) and one from `-3` (GND). The
  netlist builder silently collapses that net to ground and nothing
  works. This is usually a copy-paste mistake.

When debugging, run `buildNetlist` directly:

```ts
import { buildNetlist } from "@/simulator/netlist-builder"
import { createDefaultPinStates } from "@dreamer/schemas"
import boardState from "./boards/04-my-lesson.json"

const result = buildNetlist(boardState.components, boardState.wires, createDefaultPinStates())
console.log(result.netlist)   // ← is your component in here?
console.log(result.nets)      // ← does each component pin end up in the expected net?
```

If a component's `buildNetlist` returns `null` (servo, neopixel, etc.),
it's visual-only and will never appear in the SPICE output — that's
expected.

### LEDs/resistors visually overlap

The resistor's body spans pixel columns 3–6 (because its legs are
hardcoded to cols 3 and 6). An LED or other component placed in cols 3,
4, 5, or 6 of the same or adjacent row will have its body sitting on
top of the resistor visually. Move the LED to col 7+ on the right half,
or col 0–2 on the left half. Electrically nothing changes, but the
layout breathes.

### Component interactions don't work inside the embed

If the lesson relies on pressing a button or turning a potentiometer and
the reader's clicks seem to do nothing, verify:

- You're running with `autoRun={true}` (default) or you told the reader
  to press Play first.
- The component type actually supports UI interaction — LEDs don't
  respond to clicks, but buttons, pots, PIR toggles, sensor sliders do.
- You're not rendering two `<BreadboardEmbed>` instances on the same
  page. The pin store and button press store are module-level
  singletons today — the second embed will share pin state with the
  first. One embed per lesson page.

## Non-obvious design decisions

A few things in this directory look odd until you know why:

- **`AppProviders` inside `BreadboardEmbed`** — every embed mounts its
  own `AppProviders` so each lesson's board actor is isolated from the
  main editor's actor. Without this, the editor's autosave pipeline
  would try to save lesson boards over the user's real project file.
  Comments in [`app-providers.tsx`](../app-providers.tsx) explain the
  isolation guarantees.

- **Read-only canvas via `panMode={true} readOnly`** — we reuse the
  full `<BreadboardCanvas>` component but put it in pan-only mode.
  Structural edits (place/drag/wire/delete) are gated on `!readOnly`;
  component-level interactions (button presses, sensor sliders) live
  inside component renderers and bypass the gate.

- **Module-level `pinStateStore` and `buttonPressStore`** — see the
  warning in [`breadboard-embed.tsx`](./breadboard-embed.tsx). Don't
  render multiple embeds on the same page until those stores are
  instance-scoped, or interactions will cross-talk.

- **`"Open in IDE"` query param handoff** — clicking the link opens
  `/editor?learn=<key>`, and `app.tsx` intercepts the param on mount to
  seed the editor's board actor with the catalog state. See the board
  hydration effect in [`app.tsx`](../app.tsx) under the
  `boardHydratedForRef` logic.

- **Lesson content uses the full viewport width** — `LearnLayout`
  intentionally does not cap `main` at a max-width, because the
  interactive embed is the main event and needs horizontal space. If
  prose on ultra-wide monitors gets uncomfortable, wrap text-only
  sections in a `max-w-3xl` div inside the lesson file itself rather
  than constraining the whole layout.

## When *not* to add a lesson here

The `/learn` section is for short, interactive, narrative lessons
anchored around a single embedded circuit. If you want to document:

- **A component's behaviour / datasheet** → write a page under
  [`docs/pages/components/`](../docs/pages/components/) instead.
- **A simulator internal** (SPICE solver, VM, transpiler) → write a
  page under [`docs/pages/`](../docs/pages/) instead.
- **A multi-page tutorial that doesn't need an embed** → currently not
  supported. If this is needed, introduce a `lessonSeries` concept
  first rather than stuffing markdown into a lesson file.

---

# Encyclopedia pages

The three reference tracks — **Arduino Uno Reference**, **Arduino
Programming**, **Electronics Fundamentals** — live under
[`encyclopedia/`](./encyclopedia/). Encyclopedia pages are reference
material, not narrative. A reader lands on them by clicking a link from
a lesson, a glossary term, or the sidebar. They are encyclopedias, not
courses — keep each page focused on one question.

The build plan for the whole effort lives in
[`ENCYCLOPEDIA_TODO.md`](./ENCYCLOPEDIA_TODO.md) and the topic roadmap is
in [`LEARN_TOPICS.md`](./LEARN_TOPICS.md). This section covers **how to
write a page** once the topic is scoped.

## How encyclopedia routing works

URL shape:

```
/learn/reference/<track>/<slug>
```

Where `<track>` is one of `board`, `programming`, `electronics`.

There are three files in the routing path:

1. **[`encyclopedia-catalog.ts`](./encyclopedia-catalog.ts)** — a
   metadata-only list of every page (shipped or planned). Drives the
   sidebar and the prev/next footer.
2. **[`encyclopedia-page-registry.ts`](./encyclopedia-page-registry.ts)**
   — maps `track/slug` → a React component. This is the only module
   allowed to import page files. Kept separate from the catalog to
   break an import cycle (catalog → page → encyclopedia-layout →
   learn-layout → catalog).
3. **[`learn-router.tsx`](./learn-router.tsx)** — matches the URL,
   looks up the catalog entry for metadata, asks the page registry
   for the component, and renders it.

If either the catalog doesn't know the page or the registry can't
resolve it, you get a friendly 404-style page instead of a crash.

## Adding a new encyclopedia page — checklist

1. **Create the page file** at
   `encyclopedia/<track>/<slug>.tsx`. Copy
   [`encyclopedia/electronics/schematic-symbols.tsx`](./encyclopedia/electronics/schematic-symbols.tsx)
   as the template.
2. **Register it in the catalog.** Open
   [`encyclopedia-catalog.ts`](./encyclopedia-catalog.ts), find the
   right track section, add an entry with `status: "published"`.
   Keep entries in the same order you want them to appear in the
   sidebar. Groups inherit their first-seen order.
3. **Register the component in the page registry.** Open
   [`encyclopedia-page-registry.ts`](./encyclopedia-page-registry.ts)
   and add an import + a line to the `PAGES` map:
   ```ts
   import { MyPage } from "./encyclopedia/board/my-page"
   // ...
   const PAGES: Record<PageKey, React.ComponentType> = {
     // ...
     "board/my-page": MyPage,
   }
   ```
4. **Verify.** `bun run typecheck` and open
   `/learn/reference/<track>/<slug>` in the app. The sidebar should
   light up, the prev/next footer should walk correctly, and any
   `<SeeAlso>` links should resolve.

The planned-entries escape hatch:

- If you want to reserve a slot without writing the content yet, add
  the entry with `status: "planned"` and **do not** register it in the
  page registry. Readers who type the URL manually see a friendly
  "coming soon" page; the sidebar hides the entry by default.
- To preview planned entries during writing, append `?showPlanned=1`
  to any URL on `/learn/*`.

## Writing an encyclopedia page

### Standard shape

Every encyclopedia page is a single exported function that returns
JSX. Import the shared primitives from
[`encyclopedia-layout.tsx`](./encyclopedia-layout.tsx):

```tsx
import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function OhmsLawPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "ohms-law",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Ohm's law"
        subtitle="V = I × R — the rule that governs every DC circuit."
      />

      <Section title="The math">…</Section>
      <Section title="Worked examples">…</Section>

      <SeeAlso
        refs={[
          "electronics/resistors",
          "electronics/leds",
          "electronics/voltage-current-resistance",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}
```

A page is "done" when it has:

- a `<PageTitle>` with a title that's the question the page answers
  and a subtitle that's the one-sentence answer,
- at least one `<Section>`,
- a hand-curated `<SeeAlso>` block pointing to at least one page in
  another track (or another subgroup in the same track),
- a `<PrevNextFooter>`.

### The "one question" rule

Every encyclopedia page answers **one** question. If your page is
titled "PWM and analogWrite()" you probably need two pages — one for
the physics (`electronics/pwm`) and one for the API
(`programming/analog-io`). Cross-link them via `<Term>` and
`<SeeAlso>`.

Corollary: **never duplicate explanation across pages.** Each concept
has one canonical home. The board track links to
`electronics/pwm`; the programming track links to `electronics/pwm`;
the electronics track owns it.

### When to add a schematic

Most pages need zero schematics. A few need one. No page needs five.

Add a schematic when:

- the concept is about electrical structure (what's connected to
  what), and
- prose alone would take twice as many words, and
- the circuit is small enough to fit on a ~16-column grid.

Skip the schematic when:

- the topic is a single number (e.g. "analogRead returns 0–1023"), or
- it's an API reference, or
- the diagram would be bigger than the explanation.

**Budget: at most one schematic per page**, with two hardcoded
exceptions: the Ohm's law page (three small examples) and the
"common beginner mistakes" page (four tiny mistake diagrams). These
are called out in [`ENCYCLOPEDIA_TODO.md`](./ENCYCLOPEDIA_TODO.md).

### Using the `<Schematic>` DSL

Inline SVG only — no external image files. The DSL lives in
[`schematic.tsx`](./schematic.tsx) and exposes a small set of
authored-grid components:

```tsx
<Figure caption="D13 driving an LED through a 220Ω resistor to ground.">
  <Schematic cols={13} rows={5}>
    <Schematic.ArduinoPin at={[2, 2]} pin="D13" />
    <Schematic.Wire points={[[2, 2], [3, 2]]} />
    <Schematic.Resistor from={[3, 2]} to={[7, 2]} label="220Ω" />
    <Schematic.Wire points={[[7, 2], [8, 2]]} />
    <Schematic.Led at={[10, 2]} />
    <Schematic.Wire points={[[10, 2], [11, 2], [11, 4]]} />
    <Schematic.Ground at={[11, 4]} />
  </Schematic>
</Figure>
```

Symbols currently available: `Wire`, `Junction`, `Label`, `Resistor`,
`Led`, `Button`, `Capacitor`, `Battery`, `Vcc`, `Ground`, `ArduinoPin`.

If you need a symbol that doesn't exist, add it to
[`schematic.tsx`](./schematic.tsx) — keep it under ~20 lines of SVG
and matching ANSI/IEC conventions. Do not reach for an image file.

**The symbol gallery page at
[`encyclopedia/electronics/schematic-symbols.tsx`](./encyclopedia/electronics/schematic-symbols.tsx)
doubles as a visual regression target** — it renders every symbol. If
a symbol breaks during a refactor, it breaks here first.

### Cross-linking with `<Term>`

Every concept that has a glossary entry should be wrapped in `<Term>`
the first time it appears in a page (and subsequent times if the
distance from the first use is large enough to reward re-introducing
the term).

```tsx
import { Term } from "@/learn/term"

<p>
  The <Term k="led" /> lights up when current flows from anode to
  cathode. A <Term k="resistor">current-limiting resistor</Term>
  keeps it safe.
</p>
```

The `k` prop is type-checked — unknown keys are compile errors, and
renaming a glossary key surfaces every broken call site.

To add a new term, edit [`glossary.ts`](./glossary.ts). Keep blurbs
short (one sentence, ideally under 120 characters) and point `href`
at the canonical encyclopedia page.

### `<SeeAlso>` rules

- Always include a `<SeeAlso>` block. Even a one-item list is
  better than none.
- Prefer cross-track links: an Ohm's law page should link to
  `electronics/resistors` (same track) AND `programming/analog-io`
  (different track).
- Don't link to planned-but-unshipped entries — `<SeeAlso>`
  silently drops them, but the link would still be missing when the
  user gets there. Wait until the referenced page ships.

## Non-obvious design decisions

- **Why is the catalog metadata-only?** To avoid an import cycle.
  The catalog is read by `learn-layout.tsx` (sidebar) and
  `encyclopedia-layout.tsx` (prev/next). Encyclopedia pages import
  from `encyclopedia-layout.tsx`. If the catalog also imported page
  files, you'd get `catalog → page → layout → catalog`. The page
  registry is a separate module that only the router talks to,
  breaking the cycle.

- **Why are there two accordion levels in the sidebar?** Top-level
  for track selection, second level for subgroup. Beyond two levels
  the sidebar becomes unreadable. A third level would be a sign that
  a track has grown too big and should be split.

- **Why is `PlannedPage` a thing?** So planned entries can ship with
  the sidebar from day one without producing 404 pages. The page
  registry returns `PlannedPage` whenever the catalog says an entry
  is planned but no component is registered yet.

- **Why `const satisfies` in the glossary?** Gives us a string-literal
  union (`GlossaryKey`) for typed `<Term k="…">` without giving up
  autocomplete. Adding an entry auto-grows the union; removing one
  surfaces every broken call site at compile time.

- **Why inline SVG for schematics instead of asset files?** Dark-mode
  correctness, diffability, self-contained pages, and the ability to
  tweak colors per-symbol from one place. Pages stay portable and
  survive a dark/light theme swap without re-exporting images.

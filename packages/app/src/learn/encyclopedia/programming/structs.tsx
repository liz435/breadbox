// Arduino Programming > C++ essentials > Structs

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function StructsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "structs",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Structs"
        subtitle="Bundle related fields into one named type so they travel together."
      />

      <Section title="What a struct is">
        <p className="text-sm leading-relaxed">
          A <Term k="struct" /> is a user-defined type that groups
          several named fields into one value. Instead of carrying
          three loose variables for a single button — its pin
          number, its last reading, the timestamp of the last
          change — you put them inside one <code>Button</code> and
          pass that around.
        </p>

        <CodeBlock code={`struct Button {
  int pin;
  int lastState;
  unsigned long lastChange;
};

Button start = { 2, HIGH, 0 };
Button stop  = { 3, HIGH, 0 };`} />

        <Figure caption="A Button struct is one contiguous block with three named fields laid out in memory one after the other.">
          <StructLayoutDiagram />
        </Figure>
      </Section>

      <Section title="Reading and writing fields">
        <p className="text-sm leading-relaxed">
          Access fields with a dot. The struct value itself behaves
          like any other variable — you can reassign a field, read
          it in an expression, or initialise the whole struct with
          a brace list.
        </p>

        <CodeBlock code={`start.lastState = digitalRead(start.pin);
if (start.lastState == LOW) {
  start.lastChange = millis();
}`} />
      </Section>

      <Section title="A debounced button helper">
        <p className="text-sm leading-relaxed">
          Grouping pin + state + timestamp is exactly what a
          debouncer needs. One struct per button means your main
          loop stays short even with several buttons.
        </p>

        <CodeBlock code={`const unsigned long DEBOUNCE_MS = 20;

bool pressed(Button b) {
  int now = digitalRead(b.pin);
  if (now != b.lastState &&
      millis() - b.lastChange > DEBOUNCE_MS) {
    return now == LOW;
  }
  return false;
}`} />

        <Note>
          The helper takes the struct by value, so it can read the
          fields but can't mutate the caller's copy. If you need to
          update <code>lastState</code> and <code>lastChange</code>{" "}
          inside the helper, keep those updates in the caller and
          return the new state instead — Dreamer's transpiler does
          not support reference parameters.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/state-machines",
          "programming/debounce",
          "programming/variables",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Struct memory-layout diagram ───────────────────────────────────────

function StructLayoutDiagram() {
  const w = 460
  const h = 240
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const boxX = 100
  const boxW = 260
  const fields = [
    { name: "pin", type: "int", size: 2, offset: 0 },
    { name: "lastState", type: "int", size: 2, offset: 2 },
    { name: "lastChange", type: "unsigned long", size: 4, offset: 4 },
  ]
  const rowH = 48
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        <text x={w / 2} y={25} textAnchor="middle" fontSize={12} fill="#a78bfa" fontFamily={mono}>struct Button</text>
        <rect x={boxX - 2} y={42} width={boxW + 4} height={fields.length * rowH + 4} rx={4} fill="none" stroke="#a78bfa" strokeWidth={2} />
        {fields.map((f, i) => {
          const yTop = 45 + i * rowH
          return (
            <g key={f.name}>
              <rect x={boxX} y={yTop} width={boxW} height={rowH} fill="#0f0f0f" stroke="#60a5fa" strokeWidth={1.2} />
              <text x={boxX + 12} y={yTop + 22} fontSize={12} fill="#d1d5db" fontFamily={mono}>{f.type}</text>
              <text x={boxX + 12} y={yTop + 38} fontSize={11} fill="#10b981" fontFamily={mono}>{f.name}</text>
              <text x={boxX + boxW - 60} y={yTop + 22} fontSize={9} fill="#9ca3af" fontFamily={mono}>offset: {f.offset}</text>
              <text x={boxX + boxW - 60} y={yTop + 38} fontSize={9} fill="#9ca3af" fontFamily={mono}>size: {f.size}B</text>
            </g>
          )
        })}
        <text x={w / 2} y={h - 10} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily={mono}>total: 8 bytes contiguous</text>
      </svg>
    </div>
  )
}

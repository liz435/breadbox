// Arduino Programming > C++ essentials > Variables and types

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function VariablesPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "variables",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Variables and types"
        subtitle="C++ is statically typed — every variable has a type, and you pick the smallest one that fits."
      />

      <Section title="Declaring a variable">
        <p className="text-sm leading-relaxed">
          A variable declaration is{" "}
          <em className="text-gray-200">type name = value;</em>. The type
          comes first, the name second, and the optional initial value
          third.
        </p>

        <CodeBlock code={`int count = 0;
float voltage = 3.3;
bool ready = true;
char firstLetter = 'A';
const int LED_PIN = 13;`} />
      </Section>

      <Section title="The types you'll actually use">
        <Table
          headers={["Type", "Size", "Range", "Use for…"]}
          rows={[
            ["bool", "1 byte", "true / false", "Flags, on/off state"],
            ["char", "1 byte", "−128 to 127", "ASCII characters"],
            ["byte", "1 byte", "0 to 255", "Raw bytes, small counts"],
            ["int", "2 bytes", "−32,768 to 32,767", "General-purpose integers"],
            ["unsigned int", "2 bytes", "0 to 65,535", "Counts that never go negative"],
            ["long", "4 bytes", "±2.1 billion", "Large counts, millis() return"],
            ["unsigned long", "4 bytes", "0 to 4.3 billion", "Timestamps from millis()"],
            ["float", "4 bytes", "~6 digits of precision", "Decimal math"],
            ["String", "varies", "text", "Human-readable text"],
          ]}
        />

        <Note>
          On the Uno, <code>int</code> is only 16 bits, not 32. Use{" "}
          <code>long</code> when you need values past 32,767 — and always
          use <code>unsigned long</code> when storing values from{" "}
          <code>millis()</code>, which wraps after about 50 days.
        </Note>
      </Section>

      <Section title="const and unsigned">
        <p className="text-sm leading-relaxed">
          Two important modifiers:
        </p>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">const</strong> makes a
            variable read-only. The compiler rejects any attempt to change
            it. Use this for pin numbers, limits, and other values that
            should never vary: <code>const int LED_PIN = 13;</code>
          </li>
          <li>
            <strong className="text-gray-200">unsigned</strong> removes
            the sign bit, doubling the positive range. Useful when you
            know a value can't go negative — counters, indices, durations.
          </li>
        </ul>
      </Section>

      <Section title="Initialization matters">
        <p className="text-sm leading-relaxed">
          Local variables in C++ are <strong className="text-gray-200">not</strong>{" "}
          automatically zeroed. An uninitialized <code>int</code> inside a
          function contains whatever bytes happened to be in that memory
          slot. Always give locals a starting value:
        </p>

        <CodeBlock code={`void loop() {
  int count;        // BAD — undefined value
  int count2 = 0;   // GOOD — starts at zero
}`} />
      </Section>

      <SeeAlso
        refs={[
          "programming/operators",
          "programming/constants",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

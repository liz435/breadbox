// Arduino Programming > C++ essentials > Structs

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
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

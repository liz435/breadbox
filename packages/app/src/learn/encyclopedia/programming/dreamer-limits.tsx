// Arduino Programming > Limits > What Dreamer can and can't run

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function DreamerLimitsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "dreamer-limits",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="What Dreamer can and can't run"
        subtitle="Dreamer runs a carefully chosen subset of Arduino C++. Here's the line."
      />

      <Section title="How Dreamer runs your sketch">
        <p className="text-sm leading-relaxed">
          A real Arduino compiles your sketch to AVR machine code. Dreamer
          instead transpiles the sketch to JavaScript, then runs it in a
          tiny interpreter inside the simulator. This works well for the
          "Arduino subset" most sketches actually use, but it means some
          C++ features don't translate.
        </p>
      </Section>

      <Section title="What works">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["setup(), loop(), globals, functions", "Fully supported"],
            ["int, long, unsigned, float, bool, char, byte", "Supported"],
            ["Arrays of primitives", "Supported"],
            ["if / else / while / for / switch", "Supported"],
            ["pinMode, digitalRead/Write, analogRead/Write", "Supported"],
            ["millis, micros, delay, delayMicroseconds", "Supported"],
            ["Serial.print, println, available, read", "Supported"],
            ["Servo library (attach/write/read/detach)", "Supported"],
            ["const / #define constants", "Supported"],
          ]}
        />
      </Section>

      <Section title="What doesn't">
        <Table
          headers={["Feature", "Why it's rejected"]}
          rows={[
            ["Pointers (int *p, &x)", "The JS runtime has no memory addresses"],
            ["malloc / new / free / delete", "Same — no heap to manage"],
            ["Raw register access (PORTB, DDRD, TCCR1A)", "There's no AVR to talk to"],
            ["Templates (template<typename T>)", "Transpiler doesn't monomorphize"],
            ["Classes with inheritance", "Only simple structs are supported"],
            ["Inline assembly (asm())", "No AVR instructions exist here"],
            ["Multi-file sketches with .cpp/.h", "Partial — keep everything in one .ino"],
          ]}
        />

        <Warn>
          If your sketch uses any of the above, Dreamer will show a
          compile error rather than silently misbehave. Simplify the
          sketch or move the work into the supported subset.
        </Warn>
      </Section>

      <Section title="Example: what to do instead">
        <p className="text-sm leading-relaxed">
          Suppose you wanted to use a pointer to walk through an array.
          In Dreamer, use an index instead:
        </p>

        <CodeBlock code={`// REJECTED — pointers not supported
int values[4] = {1, 2, 3, 4};
int *p = values;
for (int i = 0; i < 4; i++) {
  Serial.println(*p);
  p++;
}

// SUPPORTED — plain array indexing
int values[4] = {1, 2, 3, 4};
for (int i = 0; i < 4; i++) {
  Serial.println(values[i]);
}`} />

        <Note>
          This isn't a limitation of Arduino as a concept — real boards
          handle all of the above. It's a deliberate simplification of
          the Dreamer simulator to keep the transpiler small and the
          learning path focused.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/sketch-structure",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

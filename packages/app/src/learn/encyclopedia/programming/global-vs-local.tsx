// Arduino Programming > C++ essentials > Global vs local variables

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

export function GlobalVsLocalPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "global-vs-local",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Global vs local variables"
        subtitle="Where state lives between calls to loop() — and why a naive local counter never counts."
      />

      <Section title="Locals live and die with the function">
        <p className="text-sm leading-relaxed">
          A variable declared inside a function is{" "}
          <em className="text-gray-200">local</em>. It's created fresh
          every time the function runs and vanishes the instant the
          function returns. That's exactly what you want for scratch
          values inside a calculation — and exactly what you{" "}
          <em className="text-gray-200">don't</em> want for anything
          that has to remember its value across calls.
        </p>
      </Section>

      <Section title="The broken counter">
        <p className="text-sm leading-relaxed">
          Here's a sketch that tries to count loop iterations and print
          every tenth one. It prints nothing, because{" "}
          <code className="text-gray-200">count</code> is reset to 0 on
          every call:
        </p>

        <CodeBlock code={`void loop() {
  int count = 0;     // reset every iteration
  count++;
  if (count >= 10) {
    Serial.println("ten!");
    count = 0;
  }
}`} />

        <p className="text-sm leading-relaxed">
          The fix is to hoist <code>count</code> out of{" "}
          <code>loop()</code> entirely so it lives at the top level of
          the sketch — where it survives between calls:
        </p>

        <CodeBlock code={`int count = 0;  // global — persists across loop() calls

void loop() {
  count++;
  if (count >= 10) {
    Serial.println("ten!");
    count = 0;
  }
}`} />
      </Section>

      <Section title="When each is the right answer">
        <p className="text-sm leading-relaxed">
          Use a local variable when the value is only meaningful during
          one call — a sensor reading you're about to compare, a loop
          index, a temporary sum. Use a global when the value has to
          survive across calls: counters, timestamps for{" "}
          <code>millis()</code>-based timing, state-machine state,
          cached configuration.
        </p>

        <Note>
          Globals on an AVR live in precious 2 KB of SRAM. Don't make
          everything global out of convenience — reserve them for state
          that genuinely needs to persist, and use <code>const</code>{" "}
          for anything that never changes.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/variables",
          "programming/sketch-structure",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

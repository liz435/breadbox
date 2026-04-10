// Arduino Programming > C++ essentials > Control flow

import {
  LearnLayout,
  PageTitle,
  Section,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function ControlFlowPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "control-flow",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Control flow"
        subtitle="Deciding what runs, and how many times."
      />

      <Section title="if / else">
        <p className="text-sm leading-relaxed">
          Runs a block only when a condition is true. The <code>else</code>{" "}
          branch is optional, and can chain into another <code>if</code>.
        </p>

        <CodeBlock code={`int light = analogRead(A0);

if (light < 200) {
  digitalWrite(13, HIGH);   // dark — turn LED on
} else if (light < 600) {
  digitalWrite(13, LOW);    // dim — LED off
} else {
  digitalWrite(13, LOW);    // bright — LED off
}`} />
      </Section>

      <Section title="while">
        <p className="text-sm leading-relaxed">
          Keeps running a block as long as its condition stays true.
          Check the condition before running each iteration.
        </p>

        <CodeBlock code={`int count = 0;
while (count < 5) {
  Serial.println(count);
  count++;
}`} />
      </Section>

      <Section title="for">
        <p className="text-sm leading-relaxed">
          A <code>for</code> loop packs three things into one line:
          an initializer, a continuation condition, and an update step.
          Use it whenever you know the count up front.
        </p>

        <CodeBlock code={`for (int i = 0; i < 10; i++) {
  analogWrite(9, i * 25);
  delay(50);
}`} />
      </Section>

      <Section title="switch">
        <p className="text-sm leading-relaxed">
          Dispatches on the value of an integer-like expression. Don't
          forget the <code>break</code> at the end of each case, or
          execution "falls through" into the next one.
        </p>

        <CodeBlock code={`switch (mode) {
  case 0:
    Serial.println("off");
    break;
  case 1:
    Serial.println("slow");
    break;
  case 2:
    Serial.println("fast");
    break;
  default:
    Serial.println("unknown");
    break;
}`} />
      </Section>

      <Section title="break and continue">
        <p className="text-sm leading-relaxed">
          Inside a loop, <code>break</code> exits the loop entirely, and{" "}
          <code>continue</code> skips to the next iteration. Use them
          sparingly — they can make loops hard to follow.
        </p>

        <CodeBlock code={`for (int i = 0; i < 100; i++) {
  if (i == 50) break;      // stop completely at 50
  if (i % 2 == 0) continue; // skip even numbers
  Serial.println(i);
}`} />
      </Section>

      <SeeAlso
        refs={[
          "programming/functions",
          "programming/operators",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

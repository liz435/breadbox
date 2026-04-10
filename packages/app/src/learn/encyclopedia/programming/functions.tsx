// Arduino Programming > C++ essentials > Functions

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

export function FunctionsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "functions",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Functions"
        subtitle="Break a sketch into named, reusable chunks."
      />

      <Section title="Why use them?">
        <p className="text-sm leading-relaxed">
          When the same four lines show up twice in your sketch, pull them
          into a function. The sketch gets shorter, the name tells future-
          you what the block is for, and there's only one place to fix a
          bug. <code>setup()</code> and <code>loop()</code> are themselves
          functions — you just happen to be overriding ones the Arduino
          core already provides.
        </p>
      </Section>

      <Section title="Declaring a function">
        <p className="text-sm leading-relaxed">
          A function declaration has four parts: return type, name,
          parameter list, and body.
        </p>

        <CodeBlock code={`// return type         name           parameters
int add(int a, int b) {
  return a + b;          // body
}

void blink(int pin, int ms) {
  digitalWrite(pin, HIGH);
  delay(ms);
  digitalWrite(pin, LOW);
  delay(ms);
}`} />
      </Section>

      <Section title="Calling a function">
        <CodeBlock code={`void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  blink(13, 200);        // blink pin 13 fast
  int sum = add(2, 3);   // sum is now 5
}`} />
      </Section>

      <Section title="Return values">
        <p className="text-sm leading-relaxed">
          The return type goes before the name. Use <code>void</code> for
          functions that don't return anything; any other type means the
          function must use a <code>return</code> statement to hand a value
          back to the caller.
        </p>

        <CodeBlock code={`bool isWarm(float celsius) {
  if (celsius > 25.0) return true;
  return false;
}`} />
      </Section>

      <Section title="Scope">
        <p className="text-sm leading-relaxed">
          Parameters and variables declared inside a function are{" "}
          <strong className="text-gray-200">local</strong> — they only
          exist while the function is running. Once it returns, they're
          gone. If you want a value to persist between calls, store it in
          a global variable or a <code>static</code> local.
        </p>

        <Note>
          Functions must be declared before they're called. If you want
          to write helper functions below <code>loop()</code>, add a
          prototype at the top of the file, or let Arduino's preprocessor
          handle it for you (it usually does).
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/sketch-structure",
          "programming/variables",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

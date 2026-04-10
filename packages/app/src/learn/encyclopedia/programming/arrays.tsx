// Arduino Programming > C++ essentials > Arrays

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

export function ArraysPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "arrays",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Arrays"
        subtitle="Fixed-size lists of values — the cleanest way to manage multiple pins or LEDs."
      />

      <Section title="Declaring an array">
        <p className="text-sm leading-relaxed">
          An <Term k="array">array</Term> is a fixed-size, ordered list
          of values that all share the same type. You declare it by
          writing the type, a name, square brackets with the size, and
          optionally an initializer list inside braces.
        </p>

        <CodeBlock code={`int ledPins[] = {9, 10, 11};
const int NUM_LEDS = 3;`} />

        <p className="text-sm leading-relaxed">
          When you use an initializer list, the compiler counts the
          elements for you, so you can leave the brackets empty.
        </p>
      </Section>

      <Section title="Indexing from zero">
        <p className="text-sm leading-relaxed">
          Array elements are numbered starting from{" "}
          <em className="text-gray-200">0</em>, not 1. The last valid
          index is always <code className="text-gray-200">length − 1</code>
          . Reading or writing past the end is a classic bug — C++ will
          happily clobber whatever memory is next door.
        </p>

        <CodeBlock code={`int first = ledPins[0];   // 9
int last  = ledPins[2];   // 11
// ledPins[3] — undefined behavior, do not touch`} />
      </Section>

      <Section title="Iterating with a for loop">
        <p className="text-sm leading-relaxed">
          The reason arrays exist is so you can treat a group of things
          uniformly. A <code className="text-gray-200">for</code> loop
          walks the indices, letting one block of code cover every
          element:
        </p>

        <CodeBlock code={`const int ledPins[] = {9, 10, 11};
const int NUM_LEDS = 3;

void setup() {
  for (int i = 0; i < NUM_LEDS; i++) {
    pinMode(ledPins[i], OUTPUT);
  }
}

void loop() {
  for (int i = 0; i < NUM_LEDS; i++) {
    digitalWrite(ledPins[i], HIGH);
    delay(200);
    digitalWrite(ledPins[i], LOW);
  }
}`} />

        <Note>
          Store the length in a <code>const int</code> next to the array
          so the <code>for</code> loop never falls out of sync with the
          initializer list.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/control-flow",
          "programming/variables",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

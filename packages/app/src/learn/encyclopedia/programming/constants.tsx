// Arduino Programming > C++ essentials > Constants and #define

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

export function ConstantsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "constants",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Constants and #define"
        subtitle="Why almost every good sketch starts with const int LED_PIN = 13."
      />

      <Section title="Give magic numbers a name">
        <p className="text-sm leading-relaxed">
          When a sketch is full of bare numbers — <code>13</code>,{" "}
          <code>220</code>, <code>500</code> — you (and future you) have
          to remember what they meant. Put them in a named constant at
          the top of the file and they become self-documenting:
        </p>

        <CodeBlock code={`// BAD
void setup() {
  pinMode(13, OUTPUT);
}
void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}

// GOOD
const int LED_PIN = 13;
const int BLINK_MS = 500;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}
void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(BLINK_MS);
  digitalWrite(LED_PIN, LOW);
  delay(BLINK_MS);
}`} />
      </Section>

      <Section title="const int vs #define">
        <p className="text-sm leading-relaxed">
          You'll see both styles in the wild. They do almost the same
          thing, but <code>const int</code> is the modern, safer choice.
        </p>

        <CodeBlock code={`// Old style — text substitution by the preprocessor.
#define LED_PIN 13

// Modern style — a real, typed, scoped constant.
const int LED_PIN = 13;`} />

        <Note>
          <code>#define</code> has no type and no scope — the preprocessor
          just pastes the number wherever the name appears. That means a
          typo gets caught later and with a worse error. Prefer{" "}
          <code>const int</code> (or <code>constexpr int</code>) unless
          you're using a library that expects a <code>#define</code>.
        </Note>
      </Section>

      <Section title="Where to put them">
        <p className="text-sm leading-relaxed">
          Put constants at the very top of the sketch, above{" "}
          <code>setup()</code>, grouped by purpose. This gives anyone
          reading your sketch a one-stop tuning panel.
        </p>

        <CodeBlock code={`// Pin assignments
const int LED_PIN = 13;
const int BUTTON_PIN = 2;
const int SENSOR_PIN = A0;

// Tuning
const int BLINK_MS = 500;
const int DEBOUNCE_MS = 50;`} />
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

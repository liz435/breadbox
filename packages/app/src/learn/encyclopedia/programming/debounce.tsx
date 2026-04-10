// Arduino Programming > Patterns > Debouncing inputs

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

export function DebouncePage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "debounce",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Debouncing inputs"
        subtitle="Why a single button press fires five events — and how to stop it."
      />

      <Section title="Mechanical contacts chatter">
        <p className="text-sm leading-relaxed">
          When you press a button, the metal contacts don't close in
          one clean motion. They slap together, bounce apart, slap
          again, and settle — typically over 1 to 5 milliseconds. An
          Arduino reading the pin at microsecond speed sees that
          chatter as several rapid HIGH/LOW transitions, not one.
        </p>

        <p className="text-sm leading-relaxed">
          The symptom: a "press once" action (toggle an LED, increment
          a counter) triggers two, three, or five times from a single
          physical press. That's bounce, and every mechanical switch
          does it.
        </p>
      </Section>

      <Section title="The stable-for-N-ms pattern">
        <p className="text-sm leading-relaxed">
          The textbook fix is <Term k="debounce" />: track when the
          raw pin last changed, and only accept a new reading once the
          line has stayed stable for some threshold (typically 20–50
          ms — long enough to outlast the bounce, short enough to feel
          instant). It's the <code>millis()</code>-based non-blocking
          pattern applied to an input.
        </p>

        <CodeBlock code={`const int BUTTON_PIN = 2;
const unsigned long DEBOUNCE_MS = 30;

int lastRaw = HIGH;              // raw pin state last time we looked
int stable = HIGH;               // last value we believed
unsigned long lastChange = 0;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.begin(9600);
}

void loop() {
  int raw = digitalRead(BUTTON_PIN);
  if (raw != lastRaw) {
    lastChange = millis();       // the line just moved
    lastRaw = raw;
  }

  if (millis() - lastChange >= DEBOUNCE_MS && raw != stable) {
    stable = raw;
    if (stable == LOW) {         // LOW = pressed, because INPUT_PULLUP
      Serial.println("pressed");
    }
  }
}`} />

        <Note>
          Fire your action on the <em className="text-gray-200">edge</em>{" "}
          (when <code>stable</code> changes), not while it's LOW. Otherwise
          holding the button down counts as multiple presses.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/non-blocking-timing",
          "electronics/switches",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

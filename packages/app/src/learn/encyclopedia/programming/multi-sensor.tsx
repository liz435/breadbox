// Arduino Programming > Patterns > Reading multiple sensors without blocking

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

export function MultiSensorPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "multi-sensor",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Reading multiple sensors without blocking"
        subtitle="One loop(), several sensors — each with its own schedule built on millis()."
      />

      <Section title="Why schedules differ">
        <p className="text-sm leading-relaxed">
          A button needs to be polled every few milliseconds so a
          press doesn't slip through. A potentiometer is happy at
          50 Hz. A DHT11 temperature sensor can only be read about
          once per second or it returns stale data. If you use a
          single <code>delay()</code> you're forced to the slowest
          interval — the button becomes unresponsive because the
          loop is busy waiting on the DHT.
        </p>

        <p className="text-sm leading-relaxed">
          The fix is one timestamp per sensor. Each sensor
          remembers when it last ran and decides for itself if
          it's due, following the non-blocking{" "}
          <Term k="millis" /> idiom. They all share the same
          loop, but they don't wait on each other.
        </p>
      </Section>

      <Section title="Three sensors, three intervals">
        <CodeBlock code={`const int BUTTON_PIN = 2;
const int POT_PIN    = A0;
const int DHT_PIN    = 4;

const unsigned long BUTTON_MS = 5;
const unsigned long POT_MS    = 20;
const unsigned long DHT_MS    = 2000;

unsigned long lastButton = 0;
unsigned long lastPot    = 0;
unsigned long lastDht    = 0;

void setup() {
  Serial.begin(9600);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
}

void loop() {
  unsigned long now = millis();

  if (now - lastButton >= BUTTON_MS) {
    lastButton = now;
    int b = digitalRead(BUTTON_PIN);
    // act on button state
  }

  if (now - lastPot >= POT_MS) {
    lastPot = now;
    int p = analogRead(POT_PIN);
    // act on pot value
  }

  if (now - lastDht >= DHT_MS) {
    lastDht = now;
    // read DHT and act on temperature
  }
}`} />
      </Section>

      <Section title="The pattern">
        <p className="text-sm leading-relaxed">
          Every sensor follows the same shape: a constant
          <code>INTERVAL</code>, a <code>last</code> timestamp,
          and a single <code>if</code> that resets the timestamp
          and does the work. Add a fourth sensor by copying the
          block — no rewrites to the ones already there.
        </p>

        <Note>
          Do the expensive work inside the <code>if</code>, not
          outside. Reading the DHT unconditionally every loop
          iteration defeats the whole pattern and can lock the
          sensor up.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/non-blocking-timing",
          "programming/state-machines",
          "programming/timing",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

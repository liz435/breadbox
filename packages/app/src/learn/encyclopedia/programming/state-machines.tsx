// Arduino Programming > Patterns > State machines for blinking patterns

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

export function StateMachinesPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "state-machines",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="State machines for blinking patterns"
        subtitle="When one blink period isn't enough, move from a timer to a list of named states."
      />

      <Section title="From one interval to many">
        <p className="text-sm leading-relaxed">
          The classic non-blocking blink has a single interval — LED
          on for 500 ms, off for 500 ms, repeat. A traffic light needs
          three: green for 3 seconds, yellow for 1, red for 3. A
          breathing pattern needs dozens. Trying to bolt all of this
          onto one <code>millis()</code> comparison gets ugly fast.
        </p>

        <p className="text-sm leading-relaxed">
          The fix is to promote the sketch to a{" "}
          <Term k="state-machine" />: the program is always in exactly
          one named state, and each state has its own behavior and
          its own timeout that triggers a jump to the next state.
        </p>
      </Section>

      <Section title="Traffic light in three states">
        <CodeBlock code={`enum Light { GREEN, YELLOW, RED };
Light state = GREEN;
unsigned long stateStart = 0;

const int GREEN_PIN  = 9;
const int YELLOW_PIN = 10;
const int RED_PIN    = 11;

void enter(Light next) {
  state = next;
  stateStart = millis();
  digitalWrite(GREEN_PIN,  state == GREEN);
  digitalWrite(YELLOW_PIN, state == YELLOW);
  digitalWrite(RED_PIN,    state == RED);
}

void setup() {
  pinMode(GREEN_PIN,  OUTPUT);
  pinMode(YELLOW_PIN, OUTPUT);
  pinMode(RED_PIN,    OUTPUT);
  enter(GREEN);
}

void loop() {
  unsigned long elapsed = millis() - stateStart;
  switch (state) {
    case GREEN:
      if (elapsed >= 3000) enter(YELLOW);
      break;
    case YELLOW:
      if (elapsed >= 1000) enter(RED);
      break;
    case RED:
      if (elapsed >= 3000) enter(GREEN);
      break;
  }
}`} />

        <Note>
          The key moves: an <code>enum</code> for the legal states, a
          timestamp for when the current state started, a helper that
          records both whenever the state changes, and a{" "}
          <code>switch</code> in <code>loop()</code> that decides when
          to transition. This scales to as many steps as you like
          without ever calling <code>delay()</code>.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/non-blocking-timing",
          "programming/control-flow",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// Arduino Programming > Patterns > Finite state machines for UI flows

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

export function UiStateMachinesPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "ui-state-machines",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Finite state machines for UI flows"
        subtitle="Detecting single-press, double-press, and long-press from one button is a state machine problem."
      />

      <Section title="Beyond blinking">
        <p className="text-sm leading-relaxed">
          The traffic-light <Term k="state-machine" /> on the
          blinking-patterns page transitions on time. A UI state
          machine also transitions on <em>events</em> — the button
          going up or down — and on <em>timeouts</em>, so a long
          press is "stayed in the PRESSED state for more than
          600 ms". The machinery is the same: an{" "}
          <code>enum</code> of states, a timestamp, a single
          switch in <code>loop()</code>.
        </p>
      </Section>

      <Section title="Three gestures from one button">
        <CodeBlock code={`enum Btn { IDLE, PRESSED, WAIT_DOUBLE };

const int BUTTON_PIN = 2;
const unsigned long LONG_MS   = 600;
const unsigned long DOUBLE_MS = 250;

Btn state = IDLE;
unsigned long stateStart = 0;

void onSingle()  { /* single press */ }
void onDouble()  { /* double press */ }
void onLong()    { /* long press   */ }

void loop() {
  int raw = digitalRead(BUTTON_PIN);
  unsigned long now = millis();

  switch (state) {
    case IDLE:
      if (raw == LOW) {
        state = PRESSED;
        stateStart = now;
      }
      break;

    case PRESSED:
      if (raw == HIGH) {
        if (now - stateStart >= LONG_MS) {
          onLong();
          state = IDLE;
        } else {
          state = WAIT_DOUBLE;
          stateStart = now;
        }
      }
      break;

    case WAIT_DOUBLE:
      if (raw == LOW) {
        onDouble();
        state = IDLE;
      } else if (now - stateStart >= DOUBLE_MS) {
        onSingle();
        state = IDLE;
      }
      break;
  }
}`} />
      </Section>

      <Section title="Reading the transitions">
        <p className="text-sm leading-relaxed">
          <code>IDLE</code> waits for the button to go down and
          jumps to <code>PRESSED</code>. <code>PRESSED</code>{" "}
          waits for the button to come back up — if you held it
          long enough, that's a long press; otherwise it might
          still be the first half of a double-press, so move to
          <code>WAIT_DOUBLE</code>. <code>WAIT_DOUBLE</code>{" "}
          either sees a second press (double) or times out
          (single). Every branch has a transition; the machine
          can't get stuck.
        </p>

        <Note>
          Debouncing belongs either inside the raw read (see
          the debounce page) or as a short lockout inside
          <code>IDLE</code>. Without it, contact bounce can push
          you straight through <code>PRESSED</code> and back.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/state-machines",
          "programming/debounce",
          "programming/non-blocking-timing",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

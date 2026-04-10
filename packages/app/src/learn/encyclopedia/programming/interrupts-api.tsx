// Arduino Programming > Arduino API > Interrupts API

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function InterruptsApiPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "interrupts-api",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Interrupts API"
        subtitle="attachInterrupt lets a pin change call a function without waiting for loop()."
      />

      <Section title="The three functions">
        <p className="text-sm leading-relaxed">
          An interrupt lets the hardware call a function — the{" "}
          <em className="text-gray-200">ISR</em>, or interrupt service
          routine — the instant a pin changes, regardless of what your
          sketch is doing. On the Uno, only pins 2 and 3 support
          external interrupts.
        </p>

        <CodeBlock code={`attachInterrupt(digitalPinToInterrupt(pin), handler, mode);
// mode: LOW, CHANGE, RISING, FALLING

detachInterrupt(digitalPinToInterrupt(pin));`} />

        <p className="text-sm leading-relaxed">
          Wrap the pin number in <code>digitalPinToInterrupt()</code>{" "}
          so the same code works on boards that number their interrupt
          lines differently.
        </p>
      </Section>

      <Section title="A button counter">
        <CodeBlock code={`const int BUTTON_PIN = 2;
volatile unsigned long presses = 0;

void onPress() {
  presses++;
}

void setup() {
  Serial.begin(9600);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  attachInterrupt(
    digitalPinToInterrupt(BUTTON_PIN),
    onPress,
    FALLING
  );
}

void loop() {
  Serial.println(presses);
  delay(500);
}`} />
      </Section>

      <Section title="Rules of ISRs">
        <p className="text-sm leading-relaxed">
          Any variable an ISR and the main loop both touch{" "}
          <em className="text-gray-200">must</em> be declared{" "}
          <code>volatile</code>, or the compiler may cache it in a
          register and miss updates. Keep ISRs short — no{" "}
          <code>delay()</code>, no <code>Serial.print()</code>, no
          long computations. Set a flag, increment a counter, and
          return; let <code>loop()</code> do the real work next time
          through.
        </p>

        <Warn>
          Inside an ISR, <code>millis()</code> still returns — but it
          won't increment, because the timer interrupt that updates
          it is blocked while your ISR is running. Keep ISRs
          microseconds, not milliseconds.
        </Warn>

        <Note>
          Mechanical buttons bounce. A <code>FALLING</code> interrupt
          on a raw button will fire several times per press. Debounce
          in software (a short lockout timestamp works) or use an RC
          filter.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/interrupts",
          "programming/non-blocking-timing",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

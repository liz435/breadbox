// Arduino Uno Reference > Signals & timing > Hardware interrupts

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function InterruptsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "interrupts",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Hardware interrupts"
        subtitle="Two pins that can wake the CPU the instant something changes."
      />

      <Section title="What is an interrupt?">
        <p className="text-sm leading-relaxed">
          Normally your sketch runs <code>loop()</code> over and over,
          checking pins as it goes (polling). A hardware interrupt lets
          the chip pause whatever it's doing the instant a pin changes
          state, run a short function you provide, and then resume right
          where it left off. This is much faster than polling and means
          you never miss a brief signal.
        </p>
      </Section>

      <Section title="Which pins?">
        <p className="text-sm leading-relaxed">
          On the Arduino Uno, only two pins support external interrupts:
        </p>

        <Table
          headers={["Pin", "Interrupt number", "Name"]}
          rows={[
            ["D2", "0", "INT0"],
            ["D3", "1", "INT1"],
          ]}
        />

        <Note>
          Other Arduino boards (Mega, Due, Zero) have more interrupt-capable
          pins. On the Uno, D2 and D3 are it.
        </Note>
      </Section>

      <Section title="Trigger modes">
        <p className="text-sm leading-relaxed">
          When you attach an interrupt, you choose which signal edge fires it:
        </p>

        <Table
          headers={["Mode", "Fires when…"]}
          rows={[
            ["RISING", "The pin goes from LOW to HIGH"],
            ["FALLING", "The pin goes from HIGH to LOW"],
            ["CHANGE", "The pin changes in either direction"],
            ["LOW", "The pin is held LOW (fires repeatedly)"],
          ]}
        />
      </Section>

      <Section title="Using attachInterrupt()">
        <CodeBlock code={`const int BUTTON_PIN = 2;
volatile bool pressed = false;

void handlePress() {
  pressed = true;
}

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  attachInterrupt(
    digitalPinToInterrupt(BUTTON_PIN),
    handlePress,
    FALLING
  );
  Serial.begin(9600);
}

void loop() {
  if (pressed) {
    Serial.println("Button pressed!");
    pressed = false;
  }
}`} />

        <Warn>
          Variables shared between an interrupt handler and the main loop
          must be declared <code>volatile</code>. Without it, the compiler
          may optimize away reads from the variable because it doesn't
          know the value can change outside normal program flow. Keep
          interrupt handlers as short as possible — no <code>delay()</code>,
          no <code>Serial.print()</code>, no long math.
        </Warn>
      </Section>

      <Section title="Polling vs interrupts">
        <p className="text-sm leading-relaxed">
          Use polling (<Term k="digital-read">digitalRead()</Term> in a
          loop) for slow signals like a <Term k="button">button</Term>{" "}
          pressed by a human. Use interrupts when the signal is too fast
          to catch by polling — rotary encoders, frequency counters, or
          wake-from-sleep triggers.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "board/digital-pins",
          "programming/timing",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// Arduino Programming > Arduino API > Digital I/O

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function DigitalIoPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "digital-io",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Digital I/O"
        subtitle="Reading and writing the two states a digital pin can hold."
      />

      <Section title="pinMode()">
        <p className="text-sm leading-relaxed">
          Before you use a digital pin, tell the chip which direction it
          goes. Call <Term k="pin-mode">pinMode()</Term> once in{" "}
          <code>setup()</code> for each pin:
        </p>

        <CodeBlock code={`pinMode(13, OUTPUT);        // drive the pin
pinMode(2, INPUT);          // read the pin (external pull-up/down required)
pinMode(2, INPUT_PULLUP);   // read the pin with the internal pull-up enabled`} />
      </Section>

      <Section title="digitalWrite() — drive a pin">
        <p className="text-sm leading-relaxed">
          Once a pin is an <code>OUTPUT</code>, use{" "}
          <Term k="digital-write">digitalWrite()</Term> to set it HIGH
          (5 V) or LOW (0 V):
        </p>

        <CodeBlock code={`digitalWrite(13, HIGH);  // 5 V
digitalWrite(13, LOW);   // 0 V`} />
      </Section>

      <Section title="digitalRead() — read a pin">
        <p className="text-sm leading-relaxed">
          Once a pin is an <code>INPUT</code> or <code>INPUT_PULLUP</code>,{" "}
          <Term k="digital-read">digitalRead()</Term> returns{" "}
          <code>HIGH</code> or <code>LOW</code>:
        </p>

        <CodeBlock code={`int state = digitalRead(2);
if (state == LOW) {
  // button pressed (pulled to ground)
}`} />
      </Section>

      <Section title="The canonical button wiring">
        <p className="text-sm leading-relaxed">
          The easiest button circuit uses <Term k="input-pullup">INPUT_PULLUP</Term>.
          The button sits between the pin and ground; the internal
          pull-up keeps the pin HIGH when the button is open, and
          pressing it connects the pin to ground so <code>digitalRead</code>
          {" "}returns <code>LOW</code>.
        </p>

        <Figure caption="Button on D2 using the internal pull-up — no external resistor.">
          <Schematic cols={10} rows={6}>
            <Schematic.ArduinoPin at={[2, 2]} pin="D2" />
            <Schematic.Wire points={[[2, 2], [4, 2]]} />
            <Schematic.Button from={[4, 2]} to={[7, 2]} label="SW1" />
            <Schematic.Wire points={[[7, 2], [8, 2]]} />
            <Schematic.Wire points={[[8, 2], [8, 4]]} />
            <Schematic.Ground at={[8, 4]} />
          </Schematic>
        </Figure>

        <CodeBlock code={`const int BUTTON_PIN = 2;
const int LED_PIN = 13;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  if (digitalRead(BUTTON_PIN) == LOW) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
}`} />

        <Note>
          LOW-means-pressed feels backwards at first, but it's the
          universal Arduino convention because <code>INPUT_PULLUP</code>{" "}
          is the default recommendation for wiring buttons.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/digital-pins",
          "electronics/leds",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

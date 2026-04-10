// Arduino Programming > Libraries > IRremote library

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

export function IrRemoteLibraryPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "irremote-library",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="IRremote library"
        subtitle="Decode infra-red remote codes into hex numbers your sketch can branch on."
      />

      <Section title="What the library does">
        <p className="text-sm leading-relaxed">
          A cheap 38 kHz IR receiver module outputs a single digital
          line that pulses when a remote is pressed. Decoding those
          pulses into the original remote button is tedious, so the
          <code>IRremote</code> library does it for you. You give it
          the pin, ask it to enable reception, and then each time a
          full code arrives it hands you a number you can compare
          against.
        </p>
      </Section>

      <Section title="The classic skeleton">
        <CodeBlock code={`#include <IRremote.h>

const int IR_PIN = 2;

IRrecv irrecv(IR_PIN);
decode_results results;

void setup() {
  Serial.begin(9600);
  irrecv.enableIRIn();
}

void loop() {
  if (irrecv.decode(&results)) {
    Serial.println(results.value, HEX);
    irrecv.resume();
  }
}`} />

        <p className="text-sm leading-relaxed">
          <code>enableIRIn()</code> turns on the receiver state
          machine. Each call to <code>decode()</code> returns true
          when a full code is ready, with the bits stored in{" "}
          <code>results.value</code>. You must call{" "}
          <code>resume()</code> afterwards to arm it for the next
          code, otherwise nothing else will ever come through.
        </p>
      </Section>

      <Section title="Branching on specific buttons">
        <CodeBlock code={`void loop() {
  if (irrecv.decode(&results)) {
    if (results.value == 0xFF30CF) {
      digitalWrite(LED_BUILTIN, HIGH);
    } else if (results.value == 0xFF18E7) {
      digitalWrite(LED_BUILTIN, LOW);
    }
    irrecv.resume();
  }
}`} />

        <p className="text-sm leading-relaxed">
          The hex values are specific to your remote. Print them
          once with the skeleton above, press each button you care
          about, and paste the numbers into your code.
        </p>

        <Note>
          IR receivers pair naturally with interrupts because a
          code is an asynchronous event, but the stock
          <code>IRremote</code> library takes care of timing
          internally — you don't have to wire up
          <code>attachInterrupt</code> yourself.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/interrupts-api",
          "programming/serial-api",
          "programming/digital-io",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

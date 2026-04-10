import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function IrReceiverPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="IR Receiver"
        subtitle="38kHz infrared receiver for remote control signals."
        badge={<Badge variant="partial">Partial</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Label", "Description"]}
          rows={[
            ["Signal", "OUT", "Decoded IR signal — connect to any digital pin"],
            ["VCC", "5V", "Connect to 5V rail"],
            ["GND", "GND", "Connect to GND rail"],
          ]}
        />
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Send code (hex)", "e.g. FF00FF", "(empty)"],
            ["Signal pin", "D0–D13", "None (unassigned)"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["IRrecv class (enableIRIn, decode, resume)", "Implemented"],
            ["Deterministic codes via Inspector 'Send' button", "Implemented"],
            ["Real remote protocol decoding (NEC, RC5)", "Not implemented"],
          ]}
        />
        <Note>
          Type a hex code (e.g. <code>FF00FF</code>) in the Inspector and click <strong>Send</strong>
          to make <code>irrecv.decode(&amp;results)</code> return that code on the next call.
          The code auto-clears after ~200 ms so each press is a single event.
        </Note>
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`#include <IRremote.h>
IRrecv irrecv(11);
decode_results results;

void setup() {
  irrecv.enableIRIn();
}

void loop() {
  if (irrecv.decode(&results)) {
    Serial.println(results.value, HEX);
    irrecv.resume();
  }
}`} />
      </Section>
    </DocsLayout>
  )
}

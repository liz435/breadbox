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
            ["Signal pin", "D0–D13", "None (unassigned)"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["IRrecv class (enableIRIn, decode, resume)", "Implemented — simulates random IR codes"],
            ["Real remote protocol decoding (NEC, RC5)", "Not implemented"],
            ["IR transmitter pairing", "Not implemented"],
          ]}
        />
        <Note>In simulation, the IR receiver randomly generates codes (~5% chance per loop iteration) to test your decoding logic.</Note>
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

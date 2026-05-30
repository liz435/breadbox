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
            ["Virtual IR Remote — click a button to beam a code", "Implemented"],
            ["Deterministic codes via Inspector 'Send' button", "Implemented"],
            ["Real remote protocol decoding (NEC, RC5)", "Not implemented"],
          ]}
        />
        <Note>
          Drop an <strong>IR Remote</strong> from the palette (Input group) and click any of its
          buttons to beam an NEC code to every receiver on the board — no wiring needed. Or, for an
          exact code, type a hex value (e.g. <code>FF00FF</code>) in the receiver's Inspector and
          click <strong>Send</strong>. Either way <code>IrReceiver.decode()</code> returns
          that code on the next call.
        </Note>
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`#include <IRremote.h>

void setup() {
  Serial.begin(9600);
  IrReceiver.begin(11); // global IrReceiver — IRremote 4.x
}

void loop() {
  if (IrReceiver.decode()) {
    Serial.println(IrReceiver.decodedIRData.decodedRawData, HEX);
    IrReceiver.resume();
  }
}`} />
      </Section>

      <Section title="Example board">
        <p className="text-sm text-gray-300 leading-relaxed">
          A ready-made example board with a IR receiver is available in the sketch editor.
          Click the <strong className="text-gray-200">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-gray-200">"IR Remote Decoder"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

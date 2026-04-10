import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn, CodeBlock } from "@/docs/docs-layout"

export function PhotoresistorPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Photoresistor (LDR)"
        subtitle="Light-Dependent Resistor. Resistance decreases as light increases."
        badge={<Badge variant="partial">Partial — Inspector-driven</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Description"]}
          rows={[
            ["A", "One terminal — non-polarized, either leg works"],
            ["B", "Other terminal"],
          ]}
        />
        <Note>Photoresistors are non-polarized. Orientation does not matter.</Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Light Level", "0 – 100% (slider)", "50%"],
            ["Pin A", "D0–D13, A0–A5, power rails", "None"],
            ["Pin B", "A0–A5, GND", "None"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Modeled as 10 kΩ resistor in SPICE", "Implemented"],
            ["Current / voltage from circuit solver", "Implemented"],
            ["Light Level slider → analog pin value", "Implemented — injected via sensor bus"],
            ["analogRead returning inverted light value", "Implemented (bright light → low value, typical of a divider to GND)"],
          ]}
        />
        <Note>
          Drag the Light Level slider in the Inspector to change what your sketch reads.
          At 0% (dark) the photoresistor signal pin reads close to 1023; at 100% (bright)
          it reads close to 0, matching a typical voltage-divider wiring to GND.
        </Note>
      </Section>

      <Section title="Typical wiring (voltage divider)">
        <CodeBlock code={`// Wiring: 5V → 10kΩ fixed resistor → A0 → LDR → GND
// In bright light: LDR ↓ resistance → A0 voltage ↓
// In dark:        LDR ↑ resistance → A0 voltage ↑`} />
        <Note>
          Wire in series with a 10 kΩ resistor to GND. The midpoint goes to an analog pin.
          This creates a voltage divider where light changes the output voltage.
        </Note>
      </Section>

      <Section title="Sketch patterns">
        <CodeBlock code={`int ldrPin = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(ldrPin); // 0–1023
  // Higher value = darker (for top-side LDR in divider)
  Serial.println(raw);

  if (raw < 300) {
    // Bright — turn off LED
    digitalWrite(13, LOW);
  } else {
    // Dark — turn on LED
    digitalWrite(13, HIGH);
  }
  delay(100);
}`} />
      </Section>

      <Section title="Datasheet">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Type", "CdS photoresistor (LDR)"],
            ["Resistance in bright light", "1 kΩ – 10 kΩ"],
            ["Resistance in darkness", "1 MΩ – 10 MΩ"],
            ["Simulated resistance (Dreamer)", "10 kΩ fixed"],
            ["Operating voltage", "Up to 150 V (safe at 5V)"],
            ["Response time", "~20 ms (rise), ~30 ms (fall)"],
            ["Spectral peak", "~560 nm (yellow-green)"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

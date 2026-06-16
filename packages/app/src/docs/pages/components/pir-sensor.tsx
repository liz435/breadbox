import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function PirSensorPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="PIR Motion Sensor"
        subtitle="HC-SR501 passive infrared sensor. Detects motion from warm bodies."
        badge={<Badge variant="partial">Partial — Inspector-driven</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Label", "Description"]}
          rows={[
            ["Signal", "OUT", "Goes HIGH when motion is detected"],
            ["VCC", "5V", "Connect to 5V rail"],
            ["GND", "GND", "Connect to GND rail"],
          ]}
        />
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Motion detected", "toggle", "off"],
            ["Signal pin", "D0–D13", "None (unassigned)"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Signal pin goes HIGH while 'Motion detected' is on", "Implemented — injected into pin store"],
            ["digitalRead returns 1 / 0 to sketch", "Implemented"],
            ["Detection zone / motion cone rendering", "Not implemented"],
            ["Warm-up delay / sensitivity adjustment", "Not implemented"],
          ]}
        />
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`void setup() {
  pinMode(2, INPUT); // PIR sensor
}

void loop() {
  if (digitalRead(2) == HIGH) {
    Serial.println("Motion!");
  }
  delay(200);
}`} />
      </Section>

      <Section title="Datasheet">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Operating voltage", "4.5 – 20V"],
            ["Detection range", "Up to 7 meters"],
            ["Detection angle", "~120°"],
            ["Output", "3.3V HIGH when triggered"],
            ["Warm-up time", "~60 seconds after power-on"],
          ]}
        />
      </Section>

      <Section title="Example board">
        <p className="text-sm text-foreground leading-relaxed">
          A ready-made example board with a PIR sensor is available in the sketch editor.
          Click the <strong className="text-foreground">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-foreground">"Motion Alarm"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

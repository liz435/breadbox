import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function PirSensorPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="PIR Motion Sensor"
        subtitle="HC-SR501 passive infrared sensor. Detects motion from warm bodies."
        badge={<Badge variant="implemented">Simulated</Badge>}
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
            ["Signal pin", "D0–D13", "None (unassigned)"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Digital output (HIGH/LOW)", "Implemented — use digitalRead()"],
            ["Detection zone rendering", "Not implemented"],
            ["Sensitivity/delay adjustment", "Not implemented"],
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
    </DocsLayout>
  )
}

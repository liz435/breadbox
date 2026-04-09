import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function RelayPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Relay Module"
        subtitle="Single-channel relay for switching high-power loads (motors, lights, appliances)."
        badge={<Badge variant="implemented">Simulated</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Label", "Description"]}
          rows={[
            ["Signal", "IN", "Digital control — LOW or HIGH to switch the relay"],
            ["VCC", "5V", "Connect to 5V rail"],
            ["GND", "GND", "Connect to GND rail"],
          ]}
        />
        <Note>Most relay modules are active LOW — the relay engages when the signal pin is LOW.</Note>
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
            ["Digital switching", "Implemented — use digitalWrite()"],
            ["Click sound", "Not implemented"],
            ["Load circuit rendering", "Not implemented"],
          ]}
        />
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`void setup() {
  pinMode(7, OUTPUT); // Relay
}

void loop() {
  digitalWrite(7, HIGH); // Relay ON
  delay(1000);
  digitalWrite(7, LOW);  // Relay OFF
  delay(1000);
}`} />
      </Section>
    </DocsLayout>
  )
}

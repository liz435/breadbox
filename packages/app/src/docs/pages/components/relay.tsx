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
            ["Armature animation (NO / NC position)", "Implemented — swings based on signal pin state"],
            ["Status LED on body (ON / OFF)", "Implemented — green when energized"],
            ["Click sound", "Not implemented"],
            ["Load-side (switched) circuit", "Not implemented — you only wire the coil side"],
          ]}
        />
        <Note>
          The renderer reads the signal pin live. When your sketch writes HIGH, the armature swings
          to the NO position and the status LED lights green; writing LOW returns it to NC with a
          grey LED. This simulator treats the module as active-high — some real modules are
          active-low, so on real hardware check your board's silkscreen.
        </Note>
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

      <Section title="Example board">
        <p className="text-sm text-foreground leading-relaxed">
          A ready-made example board with a relay is available in the sketch editor.
          Click the <strong className="text-foreground">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-foreground">"Relay Toggle"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

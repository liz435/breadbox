import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn, CodeBlock } from "@/docs/docs-layout"

export function DcMotorPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="DC Motor"
        subtitle="Small brushed DC motor. Control speed with PWM via analogWrite()."
        badge={<Badge variant="implemented">Simulated</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Label", "Description"]}
          rows={[
            ["VCC", "+", "Motor supply rail (typically external +5V through a driver stage)"],
            ["Signal", "PWM", "Connect to a PWM pin for speed control, or digital pin for on/off"],
          ]}
        />
        <Warn>Never connect a motor directly to an Arduino pin — it draws too much current. Use a transistor or motor driver (L298N, L293D).</Warn>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Signal pin", "D3, D5, D6, D9, D10, D11 (PWM)", "None (unassigned)"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["PWM speed control", "Implemented — analogWrite(pin, 0-255)"],
            ["Spinning animation", "Implemented — shaft rotates at rate ∝ duty cycle"],
            ["Duty-cycle readout on the breadboard", "Implemented"],
            ["Direction control (H-bridge)", "Not implemented — single pin only"],
            ["Back-EMF / current draw", "Not implemented"],
          ]}
        />
        <Note>
          The motor visually spins whenever the signal pin has a non-zero digital or PWM value.
          Full speed (255) takes 0.8 s per revolution; 10% duty cycle slows to 3 s per revolution.
          A live duty percentage is shown below the body while spinning.
        </Note>
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`void setup() {
  pinMode(9, OUTPUT); // DC Motor
}

void loop() {
  analogWrite(9, 128); // Half speed
  delay(2000);
  analogWrite(9, 255); // Full speed
  delay(2000);
}`} />
      </Section>

      <Section title="Example board">
        <p className="text-sm text-foreground leading-relaxed">
          A ready-made example board with a DC motor is available in the sketch editor.
          Click the <strong className="text-foreground">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-foreground">"Motor Speed"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

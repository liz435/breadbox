import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn, CodeBlock } from "@/docs/docs-layout"

export function LedPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="LED"
        subtitle="Light-Emitting Diode. The most common output component."
        badge={<Badge variant="implemented">Fully Simulated</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Label", "Description"]}
          rows={[
            ["Anode", "+", "Positive terminal — connect to Arduino digital output (through a resistor)"],
            ["Cathode", "−", "Negative terminal — connect to GND"],
          ]}
        />
        <Note>The longer leg on a real LED is the anode (+). The flat edge on the dome marks the cathode (−).</Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Color", "Red, Green, Blue, Yellow, White, Orange", "Red (#ef4444)"],
            ["Anode pin", "D0–D13, A0–A5", "None (unassigned)"],
            ["Cathode pin", "D0–D13, A0–A5, GND", "None (unassigned)"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Brightness from current", "Implemented — scales 0–1 over 0–20 mA"],
            ["Glow animation when lit", "Implemented — radius scales with brightness"],
            ["Reverse polarity warning", "Implemented — red glow + badge when wired backwards"],
            ["No-resistor warning", "Implemented — warning when current > 30 mA"],
            ["Voltage / current display in schematic", "Implemented"],
            ["Current flow animation on wires", "Implemented"],
          ]}
        />
        <Warn>
          Always add a current-limiting resistor. Without one, the simulated LED will show a
          "no resistor" warning and a real LED would burn out immediately.
        </Warn>
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`void setup() {
  pinMode(13, OUTPUT); // LED1
}

void loop() {
  digitalWrite(13, HIGH); // LED1
  delay(100);
}`} />
      </Section>

      <Section title="Typical wiring">
        <p className="text-sm text-foreground leading-relaxed">
          Arduino pin → 220 Ω resistor → LED anode → LED cathode → GND
        </p>
        <Note>
          For PWM fading, use a PWM-capable pin (3, 5, 6, 9, 10, 11) with{" "}
          <code>analogWrite(pin, 0–255)</code>.
        </Note>
      </Section>

      <Section title="Datasheet">
        <Table
          headers={["Color", "Forward Voltage (Vf)", "Max Current", "Wavelength"]}
          rows={[
            ["Red", "1.8 – 2.2 V", "20 mA", "620 – 750 nm"],
            ["Green", "2.0 – 2.4 V", "20 mA", "495 – 570 nm"],
            ["Blue", "2.8 – 3.6 V", "20 mA", "450 – 490 nm"],
            ["Yellow", "1.8 – 2.2 V", "20 mA", "570 – 620 nm"],
            ["White", "3.0 – 3.4 V", "20 mA", "Broadband"],
            ["Orange", "1.8 – 2.2 V", "20 mA", "590 – 620 nm"],
          ]}
        />
        <p className="text-sm text-muted-foreground mt-2">
          Resistor formula: R = (Vsupply − Vf) / Idesired
          &nbsp;→ e.g. (5V − 2.0V) / 0.01A = <strong className="text-foreground">300 Ω</strong> (use 330 Ω standard).
        </p>
      </Section>

      <Section title="Example board">
        <p className="text-sm text-foreground leading-relaxed">
          A ready-made example board with a LED is available in the sketch editor.
          Click the <strong className="text-foreground">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-foreground">"Blink LED"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

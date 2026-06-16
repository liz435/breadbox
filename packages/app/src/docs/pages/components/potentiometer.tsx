import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function PotentiometerPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Potentiometer"
        subtitle="Three-terminal variable resistor acting as a voltage divider."
        badge={<Badge variant="implemented">Simulated</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Description"]}
          rows={[
            ["VCC", "Connect to 5V — one end of the resistive track"],
            ["Signal", "Wiper output — connect to Arduino analog input (A0–A5)"],
            ["GND", "Connect to GND — other end of the resistive track"],
          ]}
        />
        <Note>
          The signal pin must go to an analog pin (A0–A5). Read with <code>analogRead()</code>.
        </Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["VCC pin", "5V rail", "None"],
            ["Signal pin", "A0–A5", "None"],
            ["GND pin", "GND rail", "None"],
            ["Position", "0 – 100%", "50%"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Modeled as 10 kΩ voltage divider (two resistors)", "Implemented"],
            ["Knob rotation visual from position property", "Implemented"],
            ["Position slider → wiper voltage", "Implemented — ratio × (V_vcc − V_gnd)"],
            ["analogRead returning position value (0–1023)", "Implemented — voltage fed into analog pin store"],
          ]}
        />
        <Note>
          The wiper voltage is computed each simulation tick from the slider position and
          pushed to the signal pin's analog value via the circuit solver's pin feed.
        </Note>
      </Section>

      <Section title="Auto-generated sketch code">
        <p className="text-sm text-muted-foreground mb-2">
          Only a comment is generated — no active sketch code.
        </p>
        <CodeBlock code={`// Pot1 on analog pin A0
// Use analogRead(A0) to read the value (0–1023)`} />
      </Section>

      <Section title="Typical sketch patterns">
        <CodeBlock code={`// Read potentiometer
int rawValue = analogRead(A0);         // 0–1023
float voltage = rawValue * (5.0 / 1023.0); // 0–5V

// Map to servo angle
int angle = map(rawValue, 0, 1023, 0, 180);
myServo.write(angle);

// Map to LED brightness
int brightness = map(rawValue, 0, 1023, 0, 255);
analogWrite(9, brightness);`} />
      </Section>

      <Section title="Datasheet">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Type", "Linear single-turn potentiometer"],
            ["Total resistance", "10 kΩ (common value)"],
            ["Power rating", "0.5 W max"],
            ["Resolution", "Analog — continuous"],
            ["Rotation range", "~270°"],
            ["Output formula", "Vout = Vin × (position / 100)"],
          ]}
        />
        <p className="text-sm text-muted-foreground mt-2">
          Voltage divider formula: <strong className="text-foreground">Vout = Vin × R₂ / (R₁ + R₂)</strong>
          where R₁ + R₂ = total resistance (10 kΩ) and the wiper splits them.
        </p>
      </Section>

      <Section title="Example board">
        <p className="text-sm text-foreground leading-relaxed">
          A ready-made example board with a potentiometer is available in the sketch editor.
          Click the <strong className="text-foreground">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-foreground">"Pot → LED Brightness"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

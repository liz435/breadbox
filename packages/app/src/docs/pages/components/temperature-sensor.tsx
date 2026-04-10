import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function TemperatureSensorPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Temperature Sensor"
        subtitle="TMP36 analog temperature sensor. Outputs a voltage proportional to temperature."
        badge={<Badge variant="partial">Partial — Inspector-driven</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "TMP36 label", "Description"]}
          rows={[
            ["VCC", "VS", "Power — connect to 5V (or 3.3V)"],
            ["Signal", "VOUT", "Analog voltage output — connect to Arduino analog input"],
            ["GND", "GND", "Ground"],
          ]}
        />
        <Note>
          The flat face of the TMP36 TO-92 package faces you: left pin = VCC, middle = VOUT, right = GND.
        </Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Temperature", "−40 – 125 °C (slider)", "25 °C"],
            ["VCC pin", "5V rail", "None"],
            ["Signal pin", "A0–A5", "None"],
            ["GND pin", "GND rail", "None"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Visual placement and rendering", "Implemented"],
            ["Temperature slider in Inspector", "Implemented"],
            ["Voltage output based on temperature (TMP36 formula)", "Implemented"],
            ["analogRead returning voltage as 0–1023", "Implemented — via sensor injection"],
            ["SPICE electrical simulation", "Not included in netlist (bypassed — value injected directly)"],
          ]}
        />
      </Section>

      <Section title="Sketch patterns">
        <CodeBlock code={`int sensorPin = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(sensorPin);          // 0–1023
  float voltage = raw * (5.0 / 1023.0);    // 0–5V
  float tempC = (voltage - 0.5) * 100.0;   // TMP36 formula
  float tempF = tempC * 9.0 / 5.0 + 32.0;

  Serial.print("Temp: ");
  Serial.print(tempC);
  Serial.println(" C");
  delay(1000);
}`} />
        <Note>
          TMP36 formula: <strong>tempC = (Vout − 0.5V) × 100</strong>
          &nbsp;— the sensor outputs 10 mV per °C with an offset of 0.5V at 0°C.
        </Note>
      </Section>

      <Section title="Datasheet (TMP36)">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Supply voltage", "2.7 – 5.5 V"],
            ["Output voltage at 0°C", "0.5 V"],
            ["Scale factor", "10 mV / °C"],
            ["Accuracy", "±2°C (typical)"],
            ["Temperature range", "−40°C to +125°C"],
            ["Quiescent current", "50 µA"],
            ["Package", "TO-92 (3-pin)"],
            ["Output impedance", "< 1 Ω"],
          ]}
        />
        <p className="text-sm text-gray-400 mt-2">
          Formula: <strong className="text-gray-300">Vout = 0.5 + (tempC × 0.01)</strong>
          &nbsp;— e.g. at 25°C: Vout = 0.5 + 0.25 = <strong className="text-gray-300">0.75 V</strong>
        </p>
      </Section>
    </DocsLayout>
  )
}

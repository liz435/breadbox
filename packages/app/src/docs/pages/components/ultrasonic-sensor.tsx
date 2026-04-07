import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function UltrasonicSensorPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Ultrasonic Sensor"
        subtitle="HC-SR04 distance sensor. Measures distance by echo time."
        badge={<Badge variant="not-implemented">Visual Only</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Description"]}
          rows={[
            ["Trigger", "Send a 10 µs HIGH pulse to start measurement — digital output pin"],
            ["Echo", "Receives HIGH pulse proportional to distance — digital input pin"],
            ["VCC", "5V power supply"],
            ["GND", "Ground"],
          ]}
        />
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Trigger pin", "D0–D13", "None"],
            ["Echo pin", "D0–D13", "None"],
            ["VCC pin", "5V rail", "None"],
            ["GND pin", "GND rail", "None"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Visual placement and rendering", "Implemented"],
            ["SPICE electrical simulation", "Not implemented"],
            ["Echo pulse timing simulation", "Not implemented"],
            ["Distance measurement output", "Not implemented"],
            ["pulseIn() returning measured time", "Not implemented"],
          ]}
        />
      </Section>

      <Section title="Sketch patterns">
        <CodeBlock code={`const int trigPin = 7;
const int echoPin = 6;

void setup() {
  Serial.begin(9600);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
}

void loop() {
  // Send 10µs trigger pulse
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  // Read echo duration
  long duration = pulseIn(echoPin, HIGH);

  // Convert to distance (cm)
  float distance = duration * 0.034 / 2.0;

  Serial.print("Distance: ");
  Serial.print(distance);
  Serial.println(" cm");
  delay(200);
}`} />
        <Note>
          Speed of sound ≈ 340 m/s = 0.034 cm/µs. Divide by 2 because the pulse travels to the
          object and back.
        </Note>
      </Section>

      <Section title="Datasheet (HC-SR04)">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Supply voltage", "5 V"],
            ["Supply current", "15 mA"],
            ["Measuring range", "2 cm – 400 cm"],
            ["Accuracy", "±3 mm"],
            ["Measuring angle", "~15°"],
            ["Trigger input", "10 µs TTL HIGH pulse"],
            ["Echo output", "HIGH pulse proportional to distance"],
            ["Frequency", "40 kHz ultrasonic"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

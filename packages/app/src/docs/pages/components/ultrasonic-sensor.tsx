import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function UltrasonicSensorPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Ultrasonic Sensor"
        subtitle="HC-SR04 distance sensor. Measures distance by echo time."
        badge={<Badge variant="implemented">Environment Ray-Cast</Badge>}
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
            ["Distance", "2 – 400 cm (slider)", "50 cm"],
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
            ["Distance slider in Inspector", "Implemented — fallback when no obstacles present"],
            ["Environment layer (obstacles + boundary walls)", "Implemented — ray-cast distance measurement"],
            ["pulseIn(echoPin, HIGH) returns distance × 58 µs", "Implemented — via sensor bus"],
            ["Trigger pulse validation", "Implemented — sketch must set trigger pin to OUTPUT"],
            ["pulseIn timeout parameter", "Implemented — returns 0 when exceeding timeout"],
            ["Max range behavior (> 400 cm)", "Implemented — returns 0 (timeout)"],
            ["SPICE electrical simulation", "Implemented — 10kΩ input impedance per pin"],
            ["Schematic symbol", "Implemented"],
            ["Beam visualization on breadboard", "Implemented — dashed ray with hit-point marker"],
          ]}
        />
        <Note>
          When obstacles or boundary walls are present in the environment, the sensor uses ray-casting
          to measure distance automatically. The inspector slider is disabled in this mode. When no
          obstacles exist, the slider controls the distance manually.
        </Note>
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

      <Section title="Example board">
        <p className="text-sm text-foreground leading-relaxed">
          A ready-made example board with a ultrasonic sensor is available in the sketch editor.
          Click the <strong className="text-foreground">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-foreground">"Distance Sensor"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

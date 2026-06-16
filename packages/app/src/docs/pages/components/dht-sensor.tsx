import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function DhtSensorPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="DHT Sensor"
        subtitle="DHT11 / DHT22 digital temperature and humidity sensor."
        badge={<Badge variant="partial">Partial</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Label", "Description"]}
          rows={[
            ["Signal", "DATA", "Digital data pin — connect to any digital pin"],
            ["VCC", "5V", "Connect to 5V (DHT11) or 3.3V–5V (DHT22)"],
            ["GND", "GND", "Connect to GND"],
          ]}
        />
        <Note>Add a 10kΩ pull-up resistor between DATA and VCC for reliable communication.</Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Variant", "DHT11, DHT22", "DHT11"],
            ["Temperature", "−40 – 80 °C (slider)", "25 °C"],
            ["Humidity", "0 – 100% (slider)", "50%"],
            ["Signal pin", "D0–D13", "None (unassigned)"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["DHT class (begin, readTemperature, readHumidity)", "Implemented"],
            ["computeHeatIndex", "Implemented"],
            ["Adjustable temperature/humidity via Inspector sliders", "Implemented"],
            ["Real 1-Wire timing protocol", "Not implemented — responds instantly"],
          ]}
        />
        <Note>
          <code>dht.readTemperature()</code> and <code>dht.readHumidity()</code> now return the
          values you set in the Inspector for the matching component. Multiple DHT sensors on
          different pins use each sensor's own Inspector values.
        </Note>
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`#include <DHT.h>
DHT dht(2, DHT11);

void setup() {
  dht.begin();
}

void loop() {
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  Serial.print("Temp: "); Serial.print(temp);
  Serial.print(" Humidity: "); Serial.println(hum);
  delay(2000);
}`} />
      </Section>

      <Section title="DHT11 vs DHT22">
        <Table
          headers={["Parameter", "DHT11", "DHT22"]}
          rows={[
            ["Temperature range", "0 – 50°C", "-40 – 80°C"],
            ["Temperature accuracy", "±2°C", "±0.5°C"],
            ["Humidity range", "20 – 90%", "0 – 100%"],
            ["Humidity accuracy", "±5%", "±2-5%"],
            ["Sampling rate", "1 Hz", "0.5 Hz"],
            ["Price", "~$1", "~$4"],
          ]}
        />
      </Section>

      <Section title="Example board">
        <p className="text-sm text-foreground leading-relaxed">
          A ready-made example board with a DHT sensor is available in the sketch editor.
          Click the <strong className="text-foreground">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-foreground">"Temp + Humidity"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

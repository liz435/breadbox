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
            ["Signal pin", "D0–D13", "None (unassigned)"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["DHT class (begin, readTemperature, readHumidity)", "Implemented — returns simulated 25°C, 50%"],
            ["computeHeatIndex", "Implemented"],
            ["Adjustable simulated values", "Not implemented — returns fixed values"],
            ["Real timing protocol", "Not implemented — instant response"],
          ]}
        />
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
    </DocsLayout>
  )
}

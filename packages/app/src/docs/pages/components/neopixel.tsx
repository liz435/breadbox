import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function NeoPixelPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="NeoPixel / WS2812"
        subtitle="Addressable RGB LED strip. Each LED can be individually controlled."
        badge={<Badge variant="partial">Partial</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Label", "Description"]}
          rows={[
            ["DIN", "Data In", "Connect to any digital pin — serial data line"],
            ["5V", "Power", "Connect to 5V rail"],
            ["GND", "Ground", "Connect to GND rail"],
          ]}
        />
        <Note>For long strips (&gt;30 LEDs), use an external 5V power supply. Don't power from the Arduino 5V pin.</Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Number of LEDs", "1–300", "8"],
            ["DIN pin", "D0–D13", "None (unassigned)"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Adafruit_NeoPixel class", "Implemented — begin, setPixelColor, show, Color, clear, fill"],
            ["Individual LED colors", "Implemented in stdlib (not yet visualized on breadboard)"],
            ["Brightness control", "Stub — setBrightness accepted but no visual effect"],
            ["Chained strip rendering", "Not implemented — shows static colored dots"],
          ]}
        />
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`#include <Adafruit_NeoPixel.h>
Adafruit_NeoPixel strip(8, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  strip.begin();
  strip.setBrightness(50);
  strip.show();
}

void loop() {
  for (int i = 0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i, strip.Color(255, 0, 0));
  }
  strip.show();
  delay(500);
}`} />
      </Section>

      <Section title="Typical wiring">
        <p className="text-sm text-gray-300 leading-relaxed">
          Arduino pin 6 → NeoPixel DIN · Arduino 5V → NeoPixel 5V · Arduino GND → NeoPixel GND
        </p>
        <Note>Add a 300-470Ω resistor on the data line and a 1000µF capacitor across 5V/GND for protection.</Note>
      </Section>
    </DocsLayout>
  )
}

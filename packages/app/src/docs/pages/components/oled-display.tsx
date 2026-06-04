import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function OledDisplayPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="OLED Display (SSD1306)"
        subtitle="128×64 pixel I2C OLED display. Sharp, no backlight needed."
        badge={<Badge variant="partial">Partial</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Label", "Description"]}
          rows={[
            ["SDA", "Data", "I2C data — connect to A4 (Arduino Uno)"],
            ["SCL", "Clock", "I2C clock — connect to A5 (Arduino Uno)"],
            ["VCC", "3.3V/5V", "Connect to 3.3V or 5V rail"],
            ["GND", "GND", "Connect to GND rail"],
          ]}
        />
        <Note>I2C address is typically 0x3C. Some modules use 0x3D — check the back of your display.</Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["SDA pin", "A4 (default on Uno)", "None"],
            ["SCL pin", "A5 (default on Uno)", "None"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Adafruit_SSD1306 class", "Implemented — begin, clearDisplay, display, print/println, setCursor"],
            ["Text output", "Implemented — print/println output redirected to serial as [OLED] prefix"],
            ["Pixel drawing (drawPixel, drawLine, drawRect, etc.)", "Stubs — accepted but no visual output"],
            ["Bitmap rendering", "Not implemented"],
            ["Screen visualization on breadboard", "Not implemented — shows static placeholder"],
          ]}
        />
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`#include <Wire.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Hello World!");
  display.display();
}

void loop() {
}`} />
      </Section>

      <Section title="Required libraries">
        <p className="text-sm text-gray-300 leading-relaxed">
          The SSD1306 display requires two libraries: <code>Wire.h</code> (built-in I2C) and <code>Adafruit_SSD1306.h</code>.
          Both are built-in in Breadbox's transpile mode — no installation needed.
        </p>
      </Section>

      <Section title="Example board">
        <p className="text-sm text-gray-300 leading-relaxed">
          A ready-made example board with a OLED display is available in the sketch editor.
          Click the <strong className="text-gray-200">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-gray-200">"OLED Hello World"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

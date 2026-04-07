import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn, CodeBlock } from "@/docs/docs-layout"

export function Lcd16x2Page() {
  return (
    <DocsLayout>
      <PageTitle
        title="LCD 16×2"
        subtitle="HD44780-based 16-character, 2-line alphanumeric display in 4-bit mode."
        badge={<Badge variant="not-implemented">Visual Only</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Description"]}
          rows={[
            ["RS", "Register Select — HIGH = data, LOW = command"],
            ["EN", "Enable — latches data on falling edge"],
            ["D4", "Data bit 4 (4-bit mode)"],
            ["D5", "Data bit 5"],
            ["D6", "Data bit 6"],
            ["D7", "Data bit 7 (MSB)"],
          ]}
        />
        <Note>
          Dreamer uses 4-bit mode (only D4–D7). The full LCD also has VSS (GND), VDD (5V), V0 (contrast),
          RW (ground for write-only), and A/K (backlight) — these are handled externally in a real build.
        </Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["RS pin", "D0–D13", "None"],
            ["EN pin", "D0–D13", "None"],
            ["D4 pin", "D0–D13", "None"],
            ["D5 pin", "D0–D13", "None"],
            ["D6 pin", "D0–D13", "None"],
            ["D7 pin", "D0–D13", "None"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Visual placement (green PCB with display area)", "Implemented"],
            ["Display text from sketch", "Not implemented — display is static placeholder"],
            ["Backlight / cursor animation", "Not implemented"],
            ["SPICE electrical simulation", "Not implemented"],
          ]}
        />
        <Warn>
          The LCD display does not show text from <code>lcd.print()</code> in the simulator.
          The display area renders as a static green rectangle with placeholder grid lines.
        </Warn>
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`#include <LiquidCrystal.h>

LiquidCrystal lcd(12, 11, 5, 4, 3, 2); // RS, EN, D4, D5, D6, D7

void setup() {
  lcd.begin(16, 2);
  lcd.print("Hello, World!");
}

void loop() {
  delay(100);
}`} />
      </Section>

      <Section title="Common sketch patterns">
        <CodeBlock code={`#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

void setup() {
  lcd.begin(16, 2);
}

void loop() {
  // Line 1
  lcd.setCursor(0, 0);
  lcd.print("Temp: ");
  lcd.print(25.0);
  lcd.print(" C");

  // Line 2
  lcd.setCursor(0, 1);
  lcd.print("Humidity: 60%");

  delay(1000);
}`} />
        <Note>
          <code>setCursor(col, row)</code> — col is 0–15, row is 0 (top) or 1 (bottom).
          Always call <code>lcd.clear()</code> or overwrite with spaces to avoid ghosting.
        </Note>
      </Section>

      <Section title="Datasheet (HD44780)">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Display size", "16 characters × 2 rows"],
            ["Controller", "HD44780 or compatible"],
            ["Supply voltage", "5 V"],
            ["Interface", "4-bit or 8-bit parallel"],
            ["Character matrix", "5×8 dots"],
            ["Viewing angle", "6 o'clock"],
            ["Backlight", "LED (separate Anode/Cathode pins)"],
            ["Library", "LiquidCrystal (built into Arduino IDE)"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

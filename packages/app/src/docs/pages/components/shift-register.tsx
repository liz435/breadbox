import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function ShiftRegisterPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Shift Register (74HC595)"
        subtitle="8-bit serial-in, parallel-out shift register. Control 8 outputs with 3 pins."
        badge={<Badge variant="implemented">Simulated</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Label", "Description"]}
          rows={[
            ["Data", "DS (pin 14)", "Serial data input — connect to any digital pin"],
            ["Clock", "SHCP (pin 11)", "Shift register clock — connect to any digital pin"],
            ["Latch", "STCP (pin 12)", "Storage register clock — pull LOW before shifting, HIGH to latch"],
            ["VCC", "pin 16", "Connect to 5V"],
            ["GND", "pin 8", "Connect to GND"],
            ["OE", "pin 13", "Output enable — connect to GND (active LOW)"],
            ["MR", "pin 10", "Master reset — connect to 5V (active LOW)"],
          ]}
        />
        <Note>The 74HC595 DIP-16 straddles the center gap of the breadboard, just like an IC chip.</Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Data pin", "D0–D13", "None"],
            ["Clock pin", "D0–D13", "None"],
            ["Latch pin", "D0–D13", "None"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["shiftOut() function", "Implemented — uses the built-in Arduino shiftOut()"],
            ["Parallel outputs (Q0–Q7)", "Implemented — drive LEDs/components wired to the outputs"],
            ["Cascading (daisy-chain)", "Not implemented — single chip only"],
          ]}
        />
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`void setup() {
  pinMode(2, OUTPUT); // Data
  pinMode(3, OUTPUT); // Clock
  pinMode(4, OUTPUT); // Latch
}

void loop() {
  digitalWrite(4, LOW);
  shiftOut(2, 3, MSBFIRST, 0b10101010);
  digitalWrite(4, HIGH);
  delay(500);
}`} />
      </Section>

      <Section title="Example board">
        <p className="text-sm text-gray-300 leading-relaxed">
          A ready-made example board with a shift register is available in the sketch editor.
          Click the <strong className="text-gray-200">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-gray-200">"LED Chaser (595)"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

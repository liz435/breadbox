import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn, CodeBlock } from "@/docs/docs-layout"

export function BuzzerPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Buzzer"
        subtitle="Piezoelectric buzzer for generating tones. Controlled with the tone() function."
        badge={<Badge variant="partial">Partial — No Audio Output</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Description"]}
          rows={[
            ["Positive (+)", "Signal pin — connect to Arduino digital output"],
            ["Negative (−)", "Connect to GND"],
          ]}
        />
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Positive pin", "D0–D13", "None"],
            ["Negative pin", "GND", "None"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Modeled as 30 Ω resistor in SPICE", "Implemented"],
            ["isActive when current > 0.5 mA", "Implemented"],
            ["Vibration ring animation when active", "Implemented"],
            ["Actual audio output / tone generation", "Not implemented — visual only"],
            ["Frequency from tone() call", "Not implemented"],
          ]}
        />
        <Warn>
          The buzzer makes no sound in Dreamer. The animation shows when it is electrically active,
          but <code>tone()</code> frequency is not simulated.
        </Warn>
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`void setup() {
  pinMode(8, OUTPUT); // Buzzer1
}

void loop() {
  // Use tone() to play a frequency:
  // tone(8, 440); // A4 = 440 Hz
  // delay(500);
  // noTone(8);
  delay(100);
}`} />
      </Section>

      <Section title="Sketch patterns">
        <CodeBlock code={`// Single tone
tone(8, 1000); // 1 kHz
delay(500);
noTone(8);

// Melody (C4, E4, G4)
int notes[] = {262, 330, 392};
for (int i = 0; i < 3; i++) {
  tone(8, notes[i], 300);
  delay(350);
}
noTone(8);`} />
        <Note>
          <code>tone(pin, freq)</code> generates a square wave at the specified frequency.
          <code>noTone(pin)</code> stops it. <code>tone(pin, freq, duration)</code> auto-stops after the duration.
        </Note>
      </Section>

      <Section title="Datasheet">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Type", "Piezoelectric buzzer (passive)"],
            ["Operating voltage", "3 – 5 V"],
            ["Impedance", "~30 Ω at resonant frequency"],
            ["Resonant frequency", "~4 kHz (peak volume)"],
            ["Audible range in Dreamer", "No audio — visual animation only"],
            ["Max current", "~30 mA"],
            ["No resistor needed", "Internal impedance limits current at 5V"],
          ]}
        />
        <p className="text-sm text-gray-400 mt-2">
          A <strong>passive</strong> buzzer requires an external frequency signal (use <code>tone()</code>).
          An <strong>active</strong> buzzer buzzes at a fixed frequency when powered — connect positive to HIGH.
        </p>
      </Section>
    </DocsLayout>
  )
}

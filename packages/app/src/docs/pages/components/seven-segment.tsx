import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn, CodeBlock } from "@/docs/docs-layout"

export function SevenSegmentPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="7-Segment Display"
        subtitle="Common-cathode 7-segment display for showing digits and some letters."
        badge={<Badge variant="implemented">Simulated</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Segment", "Position on display"]}
          rows={[
            ["a", "Top horizontal", "─"],
            ["b", "Top-right vertical", "┐"],
            ["c", "Bottom-right vertical", "┘"],
            ["d", "Bottom horizontal", "─"],
            ["e", "Bottom-left vertical", "└"],
            ["f", "Top-left vertical", "┌"],
            ["g", "Middle horizontal", "─"],
          ]}
        />
        <Note>
          Typical common-cathode display: connect cathode (CC) to GND.
          Drive each segment pin HIGH through a 220 Ω resistor to light it.
        </Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Pin a", "D0–D13", "None"],
            ["Pin b", "D0–D13", "None"],
            ["Pin c", "D0–D13", "None"],
            ["Pin d", "D0–D13", "None"],
            ["Pin e", "D0–D13", "None"],
            ["Pin f", "D0–D13", "None"],
            ["Pin g", "D0–D13", "None"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Visual placement", "Implemented"],
            ["Per-segment lighting from pin states", "Implemented — strict wiring mode (segment must be physically wired to a driven Arduino pin)"],
            ["Active-high common-cathode logic", "Implemented (LOW = off, HIGH = on)"],
            ["Individual segment SPICE simulation", "Implemented — each segment modeled as a 220 Ω branch to GND"],
            ["Multiplexing support (multi-digit)", "Not implemented"],
            ["Common-anode variants (inverted logic)", "Not implemented"],
          ]}
        />
        <Note>
          In strict mode, rendering follows physical connectivity only: a segment lights only when
          its footprint pin is wired to an Arduino output that is HIGH (or PWM{">"}0). Pin fields
          in the Inspector can still help code generation, but do not bypass circuit wiring.
          A decimal-point dot is drawn for reference but is not yet wired to a pin.
        </Note>
      </Section>

      <Section title="Segment patterns for digits">
        <CodeBlock code={`// Segments for digits 0–9 (common cathode, active HIGH)
// Bit order: a b c d e f g
byte digits[10] = {
  0b1111110, // 0: a b c d e f
  0b0110000, // 1: b c
  0b1101101, // 2: a b d e g
  0b1111001, // 3: a b c d g
  0b0110011, // 4: b c f g
  0b1011011, // 5: a c d f g
  0b1011111, // 6: a c d e f g
  0b1110000, // 7: a b c
  0b1111111, // 8: all
  0b1111011, // 9: a b c d f g
};

int segPins[] = {a, b, c, d, e, f, g}; // map to your pin numbers

void showDigit(int digit) {
  for (int i = 0; i < 7; i++) {
    digitalWrite(segPins[i], (digits[digit] >> (6 - i)) & 1);
  }
}`} />
      </Section>

      <Section title="Datasheet">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Type", "Common cathode (CC) — connect cathode to GND"],
            ["Supply voltage", "5 V"],
            ["Current per segment", "10 – 20 mA"],
            ["Resistor per segment", "220 Ω (at 5V, targeting 15 mA)"],
            ["Forward voltage per segment", "~2.0 V (red)"],
            ["Character height", "0.56 inch (14.2 mm) typical"],
          ]}
        />
        <p className="text-sm text-muted-foreground mt-2">
          Common-anode variants exist — wire cathodes to Arduino pins and anode to 5V through resistors.
          Logic is inverted (LOW = on).
        </p>
      </Section>

      <Section title="Example board">
        <p className="text-sm text-foreground leading-relaxed">
          A ready-made example board with a 7-segment display is available in the sketch editor.
          Click the <strong className="text-foreground">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-foreground">"7-Segment Counter"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

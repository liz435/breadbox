import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function ButtonPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Push Button"
        subtitle="Momentary SPST tactile switch. Reads LOW when pressed with INPUT_PULLUP."
        badge={<Badge variant="implemented">Simulated</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Description"]}
          rows={[
            ["A", "One side of the switch"],
            ["B", "Other side of the switch — typically connected to GND"],
          ]}
        />
        <Note>
          In INPUT_PULLUP mode: pin A goes to Arduino digital input, pin B goes to GND.
          Reads <code>LOW</code> when pressed, <code>HIGH</code> when released.
        </Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Pin A", "D0–D13, A0–A5", "None"],
            ["Pin B", "D0–D13, GND", "None"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Closed circuit when pressed (0.01 Ω)", "Implemented"],
            ["Open circuit when released (10 MΩ)", "Implemented"],
            ["isActive when current > 0.01 mA", "Implemented"],
            ["INPUT_PULLUP logic (active-low)", "Implemented"],
            ["Button press toggle via UI", "Implemented — click the button on the breadboard"],
            ["Debounce simulation", "Not implemented"],
          ]}
        />
        <Note>
          Click the button on the breadboard to toggle its pressed state during simulation.
        </Note>
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`void setup() {
  pinMode(2, INPUT_PULLUP); // Button1
}

void loop() {
  // Read: LOW = pressed, HIGH = released
  // int state = digitalRead(2);
  delay(100);
}`} />
      </Section>

      <Section title="Typical sketch pattern">
        <CodeBlock code={`const int buttonPin = 2;
const int ledPin = 13;

void setup() {
  pinMode(ledPin, OUTPUT);
  pinMode(buttonPin, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(buttonPin) == LOW) {
    digitalWrite(ledPin, HIGH); // button pressed
  } else {
    digitalWrite(ledPin, LOW);
  }
}`} />
      </Section>

      <Section title="Datasheet">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Type", "Momentary SPST tactile push button"],
            ["Contact rating", "50 mA @ 12 V DC"],
            ["Contact resistance", "< 100 mΩ (closed)"],
            ["Insulation resistance", "> 100 MΩ (open)"],
            ["Operating force", "~1.5 N"],
            ["Bounce time", "~5 ms (use software debounce in real projects)"],
          ]}
        />
      </Section>

      <Section title="Example board">
        <p className="text-sm text-foreground leading-relaxed">
          A ready-made example board with a push button is available in the sketch editor.
          Click the <strong className="text-foreground">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-foreground">"Button + LED"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

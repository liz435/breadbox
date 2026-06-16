import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn, CodeBlock } from "@/docs/docs-layout"

export function RgbLedPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="RGB LED"
        subtitle="Common-cathode RGB LED with independent red, green, and blue channels."
        badge={<Badge variant="implemented">Simulated</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Description"]}
          rows={[
            ["Red", "Red channel anode — connect through resistor to PWM pin"],
            ["Green", "Green channel anode — connect through resistor to PWM pin"],
            ["Blue", "Blue channel anode — connect through resistor to PWM pin"],
            ["Cathode", "Common ground — connect to GND"],
          ]}
        />
        <Note>
          This is a <strong>common-cathode</strong> design. All three color anodes share one GND leg.
        </Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Red pin", "PWM pins (3, 5, 6, 9, 10, 11)", "None"],
            ["Green pin", "PWM pins (3, 5, 6, 9, 10, 11)", "None"],
            ["Blue pin", "PWM pins (3, 5, 6, 9, 10, 11)", "None"],
            ["Cathode pin", "GND", "None"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Per-channel PWM reading (red, green, blue)", "Implemented — renderer reads pins.red/green/blue directly"],
            ["Color mixing (PWM → RGB dome color)", "Implemented — dome colour = rgb(R.pwm, G.pwm, B.pwm)"],
            ["Live R,G,B readout on the breadboard", "Implemented"],
            ["Brightness-scaled halo glow", "Implemented"],
            ["SPICE simulation (single net)", "Partial — modeled as one resistor; per-channel current/reverse warnings not computed"],
            ["No-resistor warning per channel", "Not implemented"],
          ]}
        />
        <Note>
          The dome color updates live as your sketch writes to the three PWM pins —
          <code>analogWrite(redPin, 200); analogWrite(greenPin, 50); analogWrite(bluePin, 0);</code>
          renders as <code>rgb(200, 50, 0)</code> (warm red-orange). Digital HIGH counts as full
          brightness on that channel.
        </Note>
        <Warn>
          Each color channel needs its own current-limiting resistor. Red needs ~100 Ω;
          green and blue need ~68 Ω (higher forward voltage). The simulator does not yet
          warn per channel, so it is up to you to include resistors in your schematic.
        </Warn>
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`void setup() {
  pinMode(9, OUTPUT);  // RGB_LED1 red
  pinMode(10, OUTPUT); // RGB_LED1 green
  pinMode(11, OUTPUT); // RGB_LED1 blue
}

void loop() {
  analogWrite(9, 128);  // RGB_LED1 red
  analogWrite(10, 128); // RGB_LED1 green
  analogWrite(11, 128); // RGB_LED1 blue
  delay(100);
}`} />
        <Note>Use PWM pins for color mixing. <code>analogWrite(pin, 0)</code> = off, <code>255</code> = full brightness.</Note>
      </Section>

      <Section title="Datasheet">
        <Table
          headers={["Channel", "Forward Voltage (Vf)", "Max Current", "Typical Resistor (5V supply)"]}
          rows={[
            ["Red", "1.8 – 2.2 V", "20 mA", "150 Ω"],
            ["Green", "2.8 – 3.4 V", "20 mA", "68 Ω"],
            ["Blue", "2.8 – 3.6 V", "20 mA", "68 Ω"],
          ]}
        />
        <p className="text-sm text-muted-foreground mt-2">
          Type: Common cathode (4-leg DIP package). Operating voltage: 2.0–3.6 V per channel.
        </p>
      </Section>

      <Section title="Example board">
        <p className="text-sm text-foreground leading-relaxed">
          A ready-made example board with a RGB LED is available in the sketch editor.
          Click the <strong className="text-foreground">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-foreground">"RGB LED Color Cycle"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

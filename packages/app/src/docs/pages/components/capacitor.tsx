import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn } from "@/docs/docs-layout"

export function CapacitorPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Capacitor"
        subtitle="Energy-storage component. Visual only — not yet included in circuit simulation."
        badge={<Badge variant="not-implemented">Visual Only</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Description"]}
          rows={[
            ["A (+)", "Positive terminal — for polarized (electrolytic) capacitors, connect to higher voltage"],
            ["B (−)", "Negative terminal — connect to lower voltage or GND"],
          ]}
        />
        <Warn>
          Electrolytic capacitors are polarized. Reversing polarity can damage or rupture them in real life.
          Ceramic capacitors are non-polarized and can be connected either way.
        </Warn>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Capacitance", "Any positive number (µF)", "100 µF"],
            ["Pin A", "D0–D13, A0–A5, power rails", "None"],
            ["Pin B", "D0–D13, A0–A5, GND", "None"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Visual placement on breadboard", "Implemented"],
            ["Capacitance value stored in Inspector", "Implemented"],
            ["SPICE simulation (charge/discharge dynamics)", "Not implemented — DC analysis only"],
            ["Filtering / smoothing effects on voltage", "Not implemented"],
            ["Current through capacitor", "Not implemented"],
          ]}
        />
        <Note>
          The circuit simulator only does DC steady-state analysis. Capacitors act as open circuits
          in DC steady state and are excluded from the SPICE netlist entirely.
        </Note>
      </Section>

      <Section title="Common use cases">
        <Table
          headers={["Use case", "Value", "Notes"]}
          rows={[
            ["Decoupling / bypass", "0.1 µF (ceramic)", "Place between VCC and GND near ICs"],
            ["Bulk decoupling", "10 – 100 µF (electrolytic)", "Stabilizes power supply voltage"],
            ["RC filter", "1 – 100 µF + resistor", "Smooths analogRead noise from sensors"],
            ["Button debounce", "0.1 µF", "Capacitor across switch terminals"],
          ]}
        />
      </Section>

      <Section title="Datasheet">
        <Table
          headers={["Parameter", "Electrolytic", "Ceramic"]}
          rows={[
            ["Polarized", "Yes — observe +/− markings", "No"],
            ["Capacitance range", "1 µF – 10,000 µF", "1 pF – 10 µF"],
            ["Max voltage (typical)", "16 – 50 V", "6.3 – 50 V"],
            ["Leakage current", "Present (µA range)", "Very low"],
            ["Temperature stability", "Poor", "Good (C0G/NP0) to moderate (X7R)"],
          ]}
        />
        <p className="text-sm text-muted-foreground mt-2">
          Charge formula: <strong className="text-foreground">Q = C × V</strong> &nbsp;|&nbsp;
          RC time constant: <strong className="text-foreground">τ = R × C</strong>
        </p>
      </Section>

      <Section title="Example board">
        <p className="text-sm text-foreground leading-relaxed">
          A ready-made example board with a capacitor is available in the sketch editor.
          Click the <strong className="text-foreground">Examples</strong> button in the toolbar
          (right of Run/Stop) and select <strong className="text-foreground">"Capacitor Blink"</strong> to
          load a complete circuit with a working sketch.
        </p>
      </Section>
    </DocsLayout>
  )
}

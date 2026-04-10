import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function ResistorPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Resistor"
        subtitle="Current-limiting passive component. Essential for LED protection."
        badge={<Badge variant="implemented">Fully Simulated</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Description"]}
          rows={[
            ["A", "One terminal — resistors are non-polarized, either terminal can be A"],
            ["B", "Other terminal"],
          ]}
        />
        <Note>Resistors are non-polarized — orientation does not matter.</Note>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Resistance", "100 Ω, 220 Ω, 330 Ω, 470 Ω, 1 kΩ, 2.2 kΩ, 4.7 kΩ, 10 kΩ, 47 kΩ, 100 kΩ, or custom", "220 Ω"],
          ]}
        />
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Voltage drop (V = I × R)", "Implemented"],
            ["Current through resistor", "Implemented"],
            ["isActive when current > 0.01 mA", "Implemented"],
            ["Schematic voltage/current annotations", "Implemented"],
            ["Power dissipation warning", "Not implemented"],
          ]}
        />
      </Section>

      <Section title="Auto-generated sketch code">
        <p className="text-sm text-gray-400">
          No sketch code is generated for resistors — they are passive components.
        </p>
      </Section>

      <Section title="Common values guide">
        <Table
          headers={["Value", "Use case"]}
          rows={[
            ["100 Ω", "LED on 3.3V supply"],
            ["220 Ω", "LED on 5V supply (standard choice)"],
            ["330 Ω", "LED on 5V supply (slightly safer)"],
            ["1 kΩ", "Pull-down resistor, base resistor for transistor"],
            ["10 kΩ", "Pull-up / pull-down for buttons and switches"],
            ["47 kΩ – 100 kΩ", "High-impedance voltage dividers"],
          ]}
        />
      </Section>

      <Section title="Datasheet">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Type", "Carbon film or metal film through-hole"],
            ["Power rating (typical)", "0.25 W"],
            ["Max power (P = I² × R)", "Exceeding 0.25 W causes overheating"],
            ["Tolerance", "±5% (gold band) or ±1% (metal film)"],
            ["Temperature coefficient", "±100 ppm/°C (carbon film)"],
          ]}
        />
        <p className="text-sm text-gray-400 mt-2">
          Ohm's law: <strong className="text-gray-300">V = I × R</strong> &nbsp;|&nbsp;
          Power: <strong className="text-gray-300">P = I² × R = V² / R</strong>
        </p>
      </Section>
    </DocsLayout>
  )
}

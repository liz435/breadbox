import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn, CodeBlock } from "@/docs/docs-layout"

export function SimulatorPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Circuit Simulator"
        subtitle="Real SPICE DC analysis runs automatically whenever the board changes."
        badge={<Badge variant="partial">Partial</Badge>}
      />

      <Section title="How it works">
        <p className="text-sm text-gray-300 leading-relaxed">
          Dreamer uses SPICE netlist analysis (via the <code>spicey</code> library) to solve the
          electrical circuit. Every time you add a component, change a wire, or update a pin
          assignment, the solver runs after a 250ms debounce. It computes voltage, current, and
          power for each component in the circuit.
        </p>
      </Section>

      <Section title="What each component produces">
        <Table
          headers={["Property", "Type", "Description"]}
          rows={[
            ["isActive", "boolean", "Whether meaningful current is flowing through this component"],
            ["voltage", "number (V)", "Voltage drop across the component terminals"],
            ["current", "number (mA)", "Current flowing through the component"],
            ["brightness", "0 – 1", "LED/buzzer drive level (current / rated current, clamped to 1)"],
            ["isReversed", "boolean", "True if voltage is negative (reverse polarity — LEDs only)"],
          ]}
        />
      </Section>

      <Section title="Active thresholds">
        <Table
          headers={["Component", "isActive when…", "brightness formula"]}
          rows={[
            ["LED", "current > 0.5 mA AND not reversed", "min(1, current / 20 mA)"],
            ["RGB LED", "any channel > 0.5 mA", "min(1, current / 20 mA) per channel"],
            ["Resistor", "current > 0.01 mA", "—"],
            ["Button", "current > 0.01 mA", "—"],
            ["Buzzer", "current > 0.5 mA", "min(1, current / 50 mA)"],
            ["Photoresistor", "current > 0.01 mA", "—"],
          ]}
        />
      </Section>

      <Section title="SPICE models">
        <Table
          headers={["Component", "SPICE element", "Model"]}
          rows={[
            ["LED", "Diode (D)", "Is=1e-14, N=1.8 — realistic forward voltage curve"],
            ["Resistor", "Resistor (R)", "Exact ohm value from Inspector"],
            ["Button (open)", "Resistor (R)", "10 MΩ"],
            ["Button (pressed)", "Resistor (R)", "0.01 Ω"],
            ["Buzzer", "Resistor (R)", "30 Ω (piezo impedance)"],
            ["Photoresistor", "Resistor (R)", "10 kΩ fixed (dark value)"],
            ["Potentiometer", "Two resistors", "10 kΩ total — position not yet wired"],
            ["5V rail", "Voltage source (V)", "5 V DC"],
            ["GND", "Ground node", "SPICE node 0"],
            ["Arduino PWM pin", "Voltage source (V)", "Duty cycle × 5 V"],
          ]}
        />
      </Section>

      <Section title="Warnings">
        <Table
          headers={["Warning", "Condition", "Meaning"]}
          rows={[
            ["no_resistor", "LED current > 30 mA", "LED has no current-limiting resistor — will burn out in real life"],
            ["reverse_polarity", "LED voltage < −0.1 V", "LED is wired backwards — add badge and red glow"],
            ["overcurrent", "Any component current > rated max", "Excessive current — check your resistor values"],
            ["open_circuit", "Voltage source present but zero current", "Circuit is not closed — check wiring"],
          ]}
        />
      </Section>

      <Section title="Limitations">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["DC steady-state analysis", "Implemented"],
            ["LED brightness and glow", "Implemented"],
            ["Current flow path animation", "Implemented"],
            ["Schematic voltage/current annotations", "Implemented"],
            ["Capacitor charge/discharge dynamics", "Not implemented — capacitors are visual only"],
            ["AC / frequency response", "Not implemented — DC only"],
            ["analogRead from sensors (ADC)", "Not implemented — always returns 0"],
            ["Potentiometer position → voltage", "Not implemented — wiper position is visual only"],
            ["Servo electrical simulation", "Not implemented — visual only"],
            ["Short-circuit detection", "Not fully implemented"],
            ["Temperature / parasitic effects", "Not implemented"],
          ]}
        />
        <Warn>
          The simulator only runs a DC analysis. Capacitors, inductors, and time-domain effects
          are not computed. Do not rely on the simulator for AC circuits or sensor readings.
        </Warn>
      </Section>

      <Section title="Current flow visualization">
        <p className="text-sm text-gray-300 leading-relaxed">
          When the circuit is active, animated arrows show the direction and magnitude of current
          flow along wires and through components. The brightness of the animation scales with
          current magnitude.
        </p>
        <Note>
          Current paths are computed from SPICE node voltages. In branching circuits, current
          distribution across parallel paths is approximated — not exact.
        </Note>
      </Section>
    </DocsLayout>
  )
}

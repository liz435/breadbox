// Electronics Fundamentals > Signals > Voltage dividers

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function VoltageDividersPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "voltage-dividers",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Voltage dividers"
        subtitle="Two resistors in series tap a fraction of the supply — the second most useful circuit in the kit."
      />

      <Section title="The formula">
        <p className="text-sm leading-relaxed">
          Put two resistors in series between a voltage source and
          ground, and the voltage at the midpoint is a fraction of
          the supply, set by the ratio of the two resistors:
        </p>

        <p className="my-3 text-center text-lg font-mono text-gray-100">
          V<sub>out</sub> = V<sub>in</sub> × R2 / (R1 + R2)
        </p>

        <p className="text-sm leading-relaxed">
          R1 is the top resistor (between V<sub>in</sub> and the
          midpoint); R2 is the bottom resistor (between the midpoint
          and ground). Bigger R2 relative to R1 means a higher
          output.
        </p>

        <Figure caption="Two resistors in series between 5 V and GND. Vout is the midpoint.">
          <Schematic cols={10} rows={8}>
            <Schematic.Vcc at={[3, 1]} label="+5V" />
            <Schematic.Wire points={[[3, 1], [3, 2]]} />
            <Schematic.Resistor from={[3, 2]} to={[3, 4]} label="R1" />
            <Schematic.Junction at={[3, 4]} />
            <Schematic.Wire points={[[3, 4], [6, 4]]} />
            <Schematic.Label at={[7, 4]} text="Vout" anchor="start" />
            <Schematic.Resistor from={[3, 4]} to={[3, 6]} label="R2" />
            <Schematic.Ground at={[3, 6]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="Worked example">
        <p className="text-sm leading-relaxed">
          A sensor outputs 0–9 V, but the Arduino ADC maxes out at
          5 V. Pick R1 = 4.7 kΩ and R2 = 4.7 kΩ:
        </p>

        <p className="mt-2 text-sm leading-relaxed font-mono text-gray-200">
          Vout = 9 V × 4.7k / (4.7k + 4.7k) = 4.5 V
        </p>

        <p className="text-sm leading-relaxed">
          The full 9 V input lands at 4.5 V at the pin — safely
          under 5 V, with headroom. Scale R2 up or down to change
          the ratio.
        </p>
      </Section>

      <Section title="Where it shows up">
        <p className="text-sm leading-relaxed">
          Potentiometers{" "}
          <em className="text-gray-200">are</em> voltage dividers —
          the wiper walks the midpoint continuously between the two
          ends. Photoresistors, thermistors, and flex sensors all
          use a fixed resistor paired with the variable one to
          produce a voltage the Arduino can measure.
        </p>

        <Note>
          The divider feeds whatever's next through its own
          resistance (the two Rs in parallel). Keep the resistors
          small compared to the input impedance of the thing you're
          driving — for the ADC, that means staying under about 10
          kΩ total.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/potentiometers",
          "electronics/ohms-law",
          "board/analog-pins",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// Electronics Fundamentals > Core concepts > Series vs parallel

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

export function SeriesParallelPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "series-parallel",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Series vs parallel"
        subtitle="Two ways to hook components together — with opposite rules."
      />

      <Section title="Series: one path for current">
        <p className="text-sm leading-relaxed">
          In a <strong className="text-gray-200">series</strong> circuit,
          components sit end-to-end on a single wire. Whatever current
          leaves the supply passes through every component in turn —
          there's nowhere else for it to go. Each component drops some
          of the voltage, and the drops add up to the supply voltage.
        </p>

        <p className="text-sm leading-relaxed mt-2">
          <em className="text-gray-200">Same current everywhere. Voltages add.</em>
        </p>

        <p className="text-sm leading-relaxed mt-2">
          Resistors in series add directly: 100 Ω + 220 Ω = 320 Ω total.
        </p>
      </Section>

      <Section title="Parallel: multiple paths">
        <p className="text-sm leading-relaxed">
          In a <strong className="text-gray-200">parallel</strong>{" "}
          circuit, components share the same two endpoints — current
          splits between them. Each branch sees the full supply voltage,
          but only carries its share of the total current.
        </p>

        <p className="text-sm leading-relaxed mt-2">
          <em className="text-gray-200">Same voltage across each branch. Currents add.</em>
        </p>

        <p className="text-sm leading-relaxed mt-2">
          Two equal resistors in parallel give half the resistance (two
          parallel 220 Ω resistors act like a single 110 Ω). The general
          rule for two is <code>(R1 × R2) / (R1 + R2)</code>.
        </p>
      </Section>

      <Section title="Drawn side by side">
        <Figure caption="Left: two resistors in series. Right: two resistors in parallel.">
          <Schematic cols={18} rows={7}>
            {/* Series circuit on the left */}
            <Schematic.Vcc at={[1, 1]} label="+V" />
            <Schematic.Wire points={[[1, 1], [1, 3]]} />
            <Schematic.Resistor from={[1, 3]} to={[1, 5]} label="R1" />
            <Schematic.Wire points={[[1, 5], [3, 5]]} />
            <Schematic.Resistor from={[3, 5]} to={[3, 3]} label="R2" />
            <Schematic.Wire points={[[3, 3], [3, 1]]} />
            <Schematic.Wire points={[[3, 1], [5, 1]]} />
            <Schematic.Wire points={[[5, 1], [5, 6]]} />
            <Schematic.Ground at={[5, 6]} />

            {/* Parallel circuit on the right */}
            <Schematic.Vcc at={[10, 1]} label="+V" />
            <Schematic.Wire points={[[10, 1], [10, 2]]} />
            <Schematic.Wire points={[[10, 2], [12, 2]]} />
            <Schematic.Wire points={[[10, 2], [10, 2]]} />
            <Schematic.Junction at={[10, 2]} />
            <Schematic.Resistor from={[10, 2]} to={[10, 5]} label="R1" />
            <Schematic.Resistor from={[12, 2]} to={[12, 5]} label="R2" />
            <Schematic.Wire points={[[10, 5], [12, 5]]} />
            <Schematic.Junction at={[10, 5]} />
            <Schematic.Wire points={[[10, 5], [10, 6]]} />
            <Schematic.Ground at={[10, 6]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="When you use each">
        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">Series:</strong> current
            limiting (resistor + LED), voltage dividers, daisy-chained
            batteries.
          </li>
          <li>
            <strong className="text-gray-200">Parallel:</strong>{" "}
            independent devices on the same rail (multiple LEDs from
            one 5 V supply), batteries in parallel for more capacity,
            fan-out from a single pin.
          </li>
        </ul>

        <Note>
          If you wire two LEDs in parallel with a single shared resistor,
          small differences between the LEDs cause one to hog the
          current. Give each LED its own resistor — that's the "fair"
          way to drive several LEDs from one pin.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/ohms-law",
          "electronics/resistors",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

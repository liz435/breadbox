// Electronics Fundamentals > Core concepts > Kirchhoff's laws, informally

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
import { Term } from "../../term"

export function KirchhoffPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "kirchhoff",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Kirchhoff's laws, informally"
        subtitle="Two rules that govern every DC circuit you'll build — and you don't need matrix math to use them."
      />

      <Section title="The current law (KCL)">
        <p className="text-sm leading-relaxed">
          <Term k="kirchhoff">Kirchhoff's current law</Term> says the
          current flowing <em className="text-gray-200">into</em> any
          junction equals the current flowing{" "}
          <em className="text-gray-200">out</em>. Electrons don't pile
          up at a node — whatever comes in has to leave through one
          of the other wires.
        </p>

        <p className="text-sm leading-relaxed">
          Practical use: if you know the current in every wire at a
          junction except one, you can figure out the last one by
          subtracting.
        </p>
      </Section>

      <Section title="The voltage law (KVL)">
        <p className="text-sm leading-relaxed">
          Kirchhoff's voltage law says that if you walk around any
          closed loop in a circuit, the voltage gains (across sources)
          exactly cancel the voltage drops (across components). The
          total change is zero — you end where you started.
        </p>

        <Figure caption="A 5 V source, a 220 Ω resistor, and a red LED around one loop. The drops (3 V + 2 V) match the source, summing to zero.">
          <Schematic cols={12} rows={6}>
            <Schematic.Vcc at={[2, 2]} label="+5V" />
            <Schematic.Wire points={[[2, 2], [3, 2]]} />
            <Schematic.Resistor from={[3, 2]} to={[7, 2]} label="3V drop" />
            <Schematic.Wire points={[[7, 2], [8, 2]]} />
            <Schematic.Led from={[8, 2]} to={[10, 2]} label="2V drop" />
            <Schematic.Wire points={[[10, 2], [10, 4]]} />
            <Schematic.Ground at={[10, 4]} />
            <Schematic.Label at={[6, 5]} text="+5 − 3 − 2 = 0" />
          </Schematic>
        </Figure>
      </Section>

      <Section title="Why you actually care">
        <p className="text-sm leading-relaxed">
          These two laws are how you reason about a circuit without
          running a simulator. KVL tells you what voltage has to be
          dropped across your current-limiting resistor given the
          supply and the LED's forward voltage. KCL tells you how to
          add up the current drawn by every component on a rail so
          you can decide whether the Arduino's regulator can handle
          it.
        </p>

        <Note>
          Both laws apply to any closed loop and any junction you can
          draw on the schematic, no matter how messy the circuit
          gets. That's the whole point — they let you slice a big
          problem into loops and nodes small enough to solve with
          Ohm's law.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/ohms-law",
          "electronics/ground",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// Electronics Fundamentals > Core concepts > Ground is a reference

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

export function GroundPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "ground",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Ground is a reference"
        subtitle="GND is just 0 V. There's no magic drain, no place electrons go to die."
      />

      <Section title="Voltage is always relative">
        <p className="text-sm leading-relaxed">
          A voltage is a <em className="text-foreground">difference</em>{" "}
          between two points. When you say "this pin is at 5 V" you
          really mean "this pin is 5 V higher than <Term k="ground">
          ground</Term>." There's no absolute voltage — voltage always
          needs two terminals.
        </p>
      </Section>

      <Section title="Ground is the reference point">
        <p className="text-sm leading-relaxed">
          To keep circuits readable, everyone agrees to pick one wire
          and call it 0 V. That wire is ground. Every other voltage in
          the circuit is measured from it. In the Arduino world, ground
          is the pin labeled <code>GND</code> and any wire connected
          directly to it.
        </p>

        <Note>
          The ground symbol on a schematic doesn't mean "send current
          here to be destroyed." It means "this wire is the zero-volt
          reference." Current still has to return to the positive
          terminal of the supply; ground is just the label on that
          return wire.
        </Note>
      </Section>

      <Section title="Measuring with a meter">
        <p className="text-sm leading-relaxed">
          A voltmeter (or a multimeter set to volts) has two probes. It
          reports the voltage difference between them. Put the black
          probe on ground and the red probe on a pin, and you read that
          pin's voltage relative to ground. Move the black probe, and
          the "same" pin reads a different number — because you've
          changed what "zero" means.
        </p>

        <Figure caption="Two meter placements on the same LED circuit. Left: across the whole LED. Right: from the LED midpoint to ground.">
          <Schematic cols={14} rows={7}>
            <Schematic.Vcc at={[1, 2]} label="+5V" />
            <Schematic.Wire points={[[1, 2], [2, 2]]} />
            <Schematic.Resistor from={[2, 2]} to={[6, 2]} label="220Ω" />
            <Schematic.Wire points={[[6, 2], [7, 2]]} />
            <Schematic.Led from={[7, 2]} to={[9, 2]} />
            <Schematic.Wire points={[[9, 2], [9, 5]]} />
            <Schematic.Ground at={[9, 5]} />

            {/* V1 label across the LED */}
            <Schematic.Label at={[8, 4]} text="V1 ≈ 2V" />
            {/* V2 label from the midpoint to ground */}
            <Schematic.Label at={[11, 3]} text="V2 ≈ 2V" />
          </Schematic>
        </Figure>

        <p className="text-sm leading-relaxed">
          Both readings happen to be about 2 V, but they're measuring
          different things. V1 is the drop across the LED. V2 is the
          voltage at the LED's cathode relative to ground. Same circuit,
          different questions.
        </p>
      </Section>

      <Section title="Shared ground is non-negotiable">
        <p className="text-sm leading-relaxed">
          If two circuits (say, your Arduino and a separately-powered
          sensor) need to talk to each other, they must share a ground
          wire. Without it, neither side agrees on what "zero" is, and
          any signal you send is meaningless. "Connect the grounds" is
          the most common beginner-forgets moment in electronics.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "board/power-pins",
          "electronics/voltage-current-resistance",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

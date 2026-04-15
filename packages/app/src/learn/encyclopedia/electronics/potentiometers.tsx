// Electronics Fundamentals > Components > Potentiometers

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

export function PotentiometersPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "potentiometers",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Potentiometers"
        subtitle="Three-terminal variable resistors — the simplest way to get a tunable voltage into an analog pin."
      />

      <Section title="A voltage divider with a knob">
        <p className="text-sm leading-relaxed">
          A <Term k="potentiometer" /> is a resistor with a sliding
          contact. The two outer terminals connect to the full
          resistance; the middle terminal (the{" "}
          <em className="text-gray-200">wiper</em>) taps somewhere
          along it. Wire the outer terminals to 5 V and ground, and
          the wiper becomes a{" "}
          <Term k="voltage-divider">voltage divider</Term> output
          that sweeps from 0 V to 5 V as you turn the knob.
        </p>

        <Figure caption="Pot as a voltage divider: outer terminals to 5 V and GND, wiper into A0.">
          <Schematic cols={12} rows={7}>
            <Schematic.Vcc at={[2, 1]} label="+5V" />
            <Schematic.Wire points={[[2, 1], [2, 2]]} />
            <Schematic.Resistor from={[2, 2]} to={[2, 4]} label="R/2" />
            <Schematic.Wire points={[[2, 4], [6, 4]]} />
            <Schematic.ArduinoPin at={[10, 4]} pin="A0" />
            <Schematic.Wire points={[[6, 4], [10, 4]]} />
            <Schematic.Junction at={[2, 4]} />
            <Schematic.Resistor from={[2, 4]} to={[2, 6]} label="R/2" />
            <Schematic.Ground at={[2, 6]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="Linear vs logarithmic taper">
        <p className="text-sm leading-relaxed">
          A <em className="text-gray-200">linear</em> pot's
          resistance changes in direct proportion to the rotation —
          halfway round is half the resistance. That's what you want
          for analog sensing, dimmers, and general-purpose tweaking.
          A <em className="text-gray-200">logarithmic</em> (audio)
          pot curves to match how humans perceive loudness; use it
          for volume controls and almost nothing else.
        </p>
      </Section>

      <Section title="Form factor and value">
        <p className="text-sm leading-relaxed">
          Rotary panel-mount pots are the classic knob; slide pots
          give you a linear fader; breadboard-friendly trimpots are
          tiny squares you tweak with a screwdriver. Typical values
          for Arduino work are{" "}
          <em className="text-gray-200">10 kΩ</em>. That's high
          enough to waste negligible current (about 0.5 mA across
          the whole element at 5 V) and low enough that the wiper's
          output impedance doesn't upset the ADC.
        </p>

        <Note>
          The ADC likes a source impedance under about 10 kΩ. If you
          use a much larger pot — say 1 MΩ — readings get noisy.
          Stick near 10 kΩ unless you have a specific reason not to.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/voltage-dividers",
          "board/analog-pins",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

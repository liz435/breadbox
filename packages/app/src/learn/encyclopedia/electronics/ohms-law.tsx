// Electronics Fundamentals > Core concepts > Ohm's law

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

export function OhmsLawPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "ohms-law",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Ohm's law"
        subtitle="V = I × R. The one equation you actually need."
      />

      <Section title="The equation">
        <p className="text-sm leading-relaxed">
          <Term k="ohms-law">Ohm's law</Term> says that across a{" "}
          <Term k="resistor">resistor</Term>, voltage equals current
          multiplied by resistance:
        </p>

        <p className="my-3 text-center text-lg font-mono text-gray-100">
          V = I × R
        </p>

        <p className="text-sm leading-relaxed">
          Rearranged, the same relationship gives you{" "}
          <code>I = V / R</code> (how much current flows at a given
          voltage and resistance) and <code>R = V / I</code> (the
          resistance needed to limit current to a target value). Those
          three forms are all the math a beginner needs.
        </p>
      </Section>

      <Section title="Worked example 1 — how much current?">
        <p className="text-sm leading-relaxed">
          You have a 5 V supply and a 1 kΩ resistor in series. How much
          current flows?
        </p>
        <p className="mt-2 text-sm leading-relaxed font-mono text-gray-200">
          I = V / R = 5 V / 1000 Ω = 0.005 A = 5 mA
        </p>
      </Section>

      <Section title="Worked example 2 — what resistor to pick?">
        <p className="text-sm leading-relaxed">
          You want 10 mA flowing through a resistor on a 5 V rail. What
          value do you need?
        </p>
        <p className="mt-2 text-sm leading-relaxed font-mono text-gray-200">
          R = V / I = 5 V / 0.01 A = 500 Ω
        </p>
        <p className="text-sm leading-relaxed">
          Round up to a standard value (470 Ω or 560 Ω) and you're done.
        </p>
      </Section>

      <Section title="Worked example 3 — the blink LED resistor">
        <p className="text-sm leading-relaxed">
          An Arduino pin is 5 V; a red LED has a forward voltage of
          about 2 V; you want ~15 mA through it. The resistor has to
          drop the remaining 3 V. So:
        </p>
        <p className="mt-2 text-sm leading-relaxed font-mono text-gray-200">
          R = V / I = (5 − 2) V / 0.015 A = 200 Ω
        </p>

        <Figure caption="The canonical Arduino LED circuit — 5 V, resistor, LED, ground.">
          <Schematic cols={12} rows={5}>
            <Schematic.ArduinoPin at={[2, 2]} pin="D13" />
            <Schematic.Wire points={[[2, 2], [3, 2]]} />
            <Schematic.Resistor from={[3, 2]} to={[7, 2]} label="220Ω" />
            <Schematic.Wire points={[[7, 2], [8, 2]]} />
            <Schematic.Led from={[8, 2]} to={[10, 2]} />
            <Schematic.Wire points={[[10, 2], [10, 4]]} />
            <Schematic.Ground at={[10, 4]} />
          </Schematic>
        </Figure>

        <Note>
          220 Ω is the standard Arduino kit value — it's a safe default
          close to the exact 200 Ω answer and leaves a little headroom
          for LED variation.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/resistors",
          "electronics/leds",
          "programming/digital-io",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

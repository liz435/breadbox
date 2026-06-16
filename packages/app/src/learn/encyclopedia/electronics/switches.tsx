// Electronics Fundamentals > Components > Switches and buttons

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

export function SwitchesPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "switches",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Switches and buttons"
        subtitle="The simplest input: a piece of metal that either touches another piece of metal or doesn't."
      />

      <Section title="Normally-open vs normally-closed">
        <p className="text-sm leading-relaxed">
          A <em className="text-foreground">normally-open</em> (NO)
          switch is open when nobody's touching it and closes when
          pressed. A momentary <Term k="button">push button</Term>{" "}
          on an Arduino is almost always NO. A{" "}
          <em className="text-foreground">normally-closed</em> (NC)
          switch is the opposite — connected by default, broken when
          pressed. NC switches are mostly used for safety interlocks
          ("if this contact ever opens, something is wrong").
        </p>
      </Section>

      <Section title="Poles and throws (SPST vs SPDT)">
        <p className="text-sm leading-relaxed">
          The naming is less scary than it looks.{" "}
          <em className="text-foreground">Pole</em> = how many separate
          circuits the switch controls at once.{" "}
          <em className="text-foreground">Throw</em> = how many
          positions each pole can connect to. An SPST switch (single
          pole, single throw) has two terminals: connected or not. An
          SPDT switch (single pole, double throw) has three: a common
          that flips between "terminal A" and "terminal B." That's a
          selector, not just an on/off.
        </p>
      </Section>

      <Section title="Inputs need a default state">
        <p className="text-sm leading-relaxed">
          A bare switch on its own isn't enough. While the switch is
          open, the Arduino pin is floating and reads garbage. You
          need a pull-up (default HIGH) or pull-down (default LOW)
          resistor to define the "unpressed" state. The easiest path
          on an Arduino is <code>INPUT_PULLUP</code>, which turns on
          the chip's internal pull-up for you.
        </p>

        <Figure caption="Canonical momentary button wiring: one side to an INPUT_PULLUP pin, the other to ground.">
          <Schematic cols={10} rows={6}>
            <Schematic.ArduinoPin at={[2, 2]} pin="D2" />
            <Schematic.Wire points={[[2, 2], [4, 2]]} />
            <Schematic.Button from={[4, 2]} to={[7, 2]} label="SW" />
            <Schematic.Wire points={[[7, 2], [7, 4]]} />
            <Schematic.Ground at={[7, 4]} />
          </Schematic>
        </Figure>

        <Note>
          Mechanical contacts also{" "}
          <em className="text-foreground">bounce</em> for a few
          milliseconds on every press and release. Any sketch that
          counts presses needs software debouncing, or you'll see
          three or four events per physical push.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/pull-ups",
          "programming/debounce",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

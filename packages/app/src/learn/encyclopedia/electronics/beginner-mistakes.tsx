// Electronics Fundamentals > Practical > Common beginner mistakes

import {
  LearnLayout,
  PageTitle,
  Section,
  Warn,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function BeginnerMistakesPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "beginner-mistakes",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Common beginner mistakes"
        subtitle="The four circuits almost everyone builds wrong at least once."
      />

      <Section title="1. Reverse polarity on an LED">
        <p className="text-sm leading-relaxed">
          LEDs only conduct one way. Wire one in backwards and the
          circuit sits quietly doing nothing — no smoke, but no light
          either. The <strong className="text-foreground">longer lead</strong>{" "}
          is the anode and goes to the positive side.
        </p>

        <Figure caption="LED wired backwards — cathode on the positive side. Nothing lights up.">
          <Schematic cols={10} rows={5}>
            <Schematic.Vcc at={[1, 2]} label="+5V" />
            <Schematic.Wire points={[[1, 2], [2, 2]]} />
            <Schematic.Resistor from={[2, 2]} to={[5, 2]} label="220Ω" />
            <Schematic.Wire points={[[5, 2], [6, 2]]} />
            {/* LED drawn backwards: from + to - goes right-to-left */}
            <Schematic.Led from={[8, 2]} to={[6, 2]} />
            <Schematic.Wire points={[[8, 2], [8, 4]]} />
            <Schematic.Ground at={[8, 4]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="2. Missing current-limiting resistor">
        <p className="text-sm leading-relaxed">
          Hooking an LED straight from 5 V to ground skips the
          resistor, and the LED pulls enough current to burn itself out
          almost immediately. Always include a series{" "}
          <Term k="resistor">resistor</Term> (220 Ω is a safe default).
        </p>

        <Figure caption="LED with no resistor. The LED burns out within seconds.">
          <Schematic cols={10} rows={5}>
            <Schematic.Vcc at={[1, 2]} label="+5V" />
            <Schematic.Wire points={[[1, 2], [5, 2]]} />
            <Schematic.Led from={[5, 2]} to={[7, 2]} />
            <Schematic.Wire points={[[7, 2], [7, 4]]} />
            <Schematic.Ground at={[7, 4]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="3. Wire from +V straight to GND">
        <p className="text-sm leading-relaxed">
          A wire that goes directly from 5 V to ground is a{" "}
          <Term k="short">short circuit</Term>. It's a zero-resistance
          path that dumps as much current as the supply can provide
          into the wire — and into the regulator, the USB port, or
          whatever else is between the wire and the source.
        </p>

        <Figure caption="Direct short — trip USB protection or smoke the regulator.">
          <Schematic cols={10} rows={5}>
            <Schematic.Vcc at={[2, 2]} label="+5V" />
            <Schematic.Wire points={[[2, 2], [7, 2]]} color="#ef4444" />
            <Schematic.Wire points={[[7, 2], [7, 4]]} color="#ef4444" />
            <Schematic.Ground at={[7, 4]} />
          </Schematic>
        </Figure>

        <Warn>
          This is the mistake you don't want to make twice. Always
          double-check your wiring before plugging the board into USB.
        </Warn>
      </Section>

      <Section title="4. Forgetting shared ground">
        <p className="text-sm leading-relaxed">
          When two circuits talk to each other — for example an Arduino
          reading a sensor powered from a separate battery — they must
          share a ground wire. Without the common ground, the "HIGH"
          signal from one side is measured against a different zero and
          means nothing to the other.
        </p>

        <Figure caption="Two power sources with no shared ground. The signal is meaningless.">
          <Schematic cols={12} rows={7}>
            <Schematic.Vcc at={[2, 2]} label="+5V (A)" />
            <Schematic.Wire points={[[2, 2], [4, 2]]} />
            <Schematic.ArduinoPin at={[4, 2]} pin="D2" />
            <Schematic.Wire points={[[4, 2], [6, 2]]} />

            <Schematic.Label at={[7, 2]} text="?" />

            <Schematic.Wire points={[[8, 2], [10, 2]]} />
            <Schematic.Vcc at={[10, 2]} label="+5V (B)" />

            <Schematic.Ground at={[3, 6]} />
            <Schematic.Ground at={[10, 6]} />
            <Schematic.Label at={[6, 5]} text="no shared GND" />
          </Schematic>
        </Figure>
      </Section>

      <SeeAlso
        refs={[
          "electronics/shorts",
          "electronics/leds",
          "board/power-pins",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

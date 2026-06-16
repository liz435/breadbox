// Electronics Fundamentals > Signals > Pull-up and pull-down resistors

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

export function PullUpsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "pull-ups",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Pull-up and pull-down resistors"
        subtitle="Floating inputs read garbage. A big resistor gives the pin a default to fall back to."
      />

      <Section title="Floating inputs are random noise">
        <p className="text-sm leading-relaxed">
          A digital input pin with nothing connected to it is{" "}
          <em className="text-foreground">floating</em>. Its voltage
          drifts with stray capacitance, nearby wires, even the
          weather — <code>digitalRead()</code> will return a
          mishmash of HIGH and LOW depending on what happened last.
          To get a sensible reading, the pin has to be tied to a
          known voltage when nothing else is driving it.
        </p>
      </Section>

      <Section title="Pull-up vs pull-down">
        <p className="text-sm leading-relaxed">
          A <Term k="pull-up">pull-up resistor</Term> connects the
          pin to 5 V, so the default state is HIGH. A pull-down
          connects it to GND, so the default state is LOW. Either
          works — the choice is which side your switch is on. A
          switch that pulls the pin to ground wants a pull-up above
          it; a switch that pulls to 5 V wants a pull-down below.
        </p>
      </Section>

      <Section title="The canonical button circuit">
        <Figure caption="10 kΩ pull-up from 5 V, button to ground. Pin reads HIGH when released, LOW when pressed.">
          <Schematic cols={10} rows={8}>
            <Schematic.Vcc at={[3, 1]} label="+5V" />
            <Schematic.Wire points={[[3, 1], [3, 2]]} />
            <Schematic.Resistor from={[3, 2]} to={[3, 4]} label="10kΩ" />
            <Schematic.Junction at={[3, 4]} />
            <Schematic.Wire points={[[3, 4], [6, 4]]} />
            <Schematic.ArduinoPin at={[8, 4]} pin="D2" />
            <Schematic.Wire points={[[6, 4], [8, 4]]} />
            <Schematic.Wire points={[[3, 4], [3, 5]]} />
            <Schematic.Button from={[3, 5]} to={[3, 7]} />
            <Schematic.Ground at={[3, 7]} />
          </Schematic>
        </Figure>

        <p className="text-sm leading-relaxed">
          10 kΩ is the textbook value. It's big enough that the idle
          current through the pull-up is negligible (0.5 mA at 5 V)
          and small enough to swamp any stray noise that tries to
          move the pin.
        </p>
      </Section>

      <Section title="INPUT_PULLUP skips the resistor">
        <p className="text-sm leading-relaxed">
          The ATmega328P has an internal pull-up on every digital
          pin. Calling <code>pinMode(pin, INPUT_PULLUP)</code>{" "}
          enables it — roughly 20 to 50 kΩ tying the pin to 5 V,
          built into the chip. That's usually enough for a button
          straight to ground, and it saves you a resistor and a
          breadboard row. There's no internal pull-down, so if you
          need the opposite polarity you're back to an external
          resistor.
        </p>

        <Note>
          The internal pull-up is weaker than an external 10 kΩ, so
          on long wires or in electrically noisy setups you may
          still want the external resistor. For a button on a
          breadboard, <code>INPUT_PULLUP</code> is fine.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/digital-io",
          "electronics/switches",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

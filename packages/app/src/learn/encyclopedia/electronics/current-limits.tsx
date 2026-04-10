// Electronics Fundamentals > Practical > Current limits for Arduino pins

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function CurrentLimitsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "current-limits",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Current limits for Arduino pins"
        subtitle="The numbers that separate a safe sketch from a dead ATmega."
      />

      <Section title="The limits that matter">
        <p className="text-sm leading-relaxed">
          The ATmega328P's I/O pins can source or sink a surprising
          amount of current for an 8-bit chip, but it has three
          nested ceilings you have to stay under. Blow past any one
          and you risk frying the MCU — silicon death is not
          covered by warranty.
        </p>

        <Table
          headers={["Limit", "Value", "Notes"]}
          rows={[
            ["Per pin (safe)", "20 mA", "Design target. Comfortable for LEDs."],
            ["Per pin (absolute max)", "40 mA", "Don't run continuously at this level."],
            ["Per port group", "100 mA", "PORTD (D0–D7), PORTB (D8–D13), PORTC (A0–A5)"],
            ["Whole chip", "200 mA", "Sum of every pin combined."],
            ["5V pin from USB", "~500 mA", "Limited by polyfuse / USB host."],
            ["5V pin from barrel jack", "~800 mA", "Limited by onboard regulator."],
          ]}
        />
      </Section>

      <Section title="Port groups catch you by surprise">
        <p className="text-sm leading-relaxed">
          The 100 mA-per-port limit is the sneaky one. You can have
          eight pins, each drawing 15 mA (well under the per-pin
          ceiling), but if they're all on PORTB you're at 120 mA —
          over. Adding up loads per individual pin isn't enough;
          check the group total too.
        </p>
      </Section>

      <Section title="The rule: anything over 20 mA needs a helper">
        <p className="text-sm leading-relaxed">
          A single LED at 10–15 mA? Drive it straight from a digital
          pin. A small buzzer? Fine. A servo's signal line? Fine —
          the servo takes its own power from the 5 V rail, not the
          pin. Anything that actually{" "}
          <em className="text-gray-200">does</em> something
          physical — a motor, a relay coil, a bright LED strip — is
          almost certainly over 20 mA and needs a transistor,
          MOSFET, or motor driver between it and the Arduino.
        </p>

        <Warn>
          Never drive a DC motor directly from an Arduino pin, no
          matter how small the motor looks. The inrush current at
          startup is many times the steady-state draw, and the
          inductive kickback when you switch it off will murder the
          pin driver. Use a transistor with a flyback diode, or a
          proper motor driver IC.
        </Warn>

        <Note>
          The 500 mA USB limit includes everything drawing from the
          5 V rail, not just pin outputs. If you power a sensor or
          an LED strip from 5 V, that current counts against the
          same budget.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/power-pins",
          "board/powering",
          "electronics/power",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// Electronics Fundamentals > Components > LEDs

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function LedsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "leds",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="LEDs"
        subtitle="Light-Emitting Diodes — the first component you'll ever wire to an Arduino."
      />

      <Section title="What an LED is">
        <p className="text-sm leading-relaxed">
          An <Term k="led">LED</Term> is a diode that emits light when
          current flows through it in the forward direction. Like all
          diodes, it only conducts one way, and it drops a nearly fixed
          voltage called the <Term k="forward-voltage">forward
          voltage</Term> (Vf) once current starts to flow.
        </p>

        <Table
          headers={["LED color", "Typical Vf", "Typical current"]}
          rows={[
            ["Red / yellow", "~2.0 V", "10–20 mA"],
            ["Green", "~2.2 V", "10–20 mA"],
            ["Blue / white", "~3.0 V", "10–20 mA"],
          ]}
        />
      </Section>

      <Section title="Polarity">
        <p className="text-sm leading-relaxed">
          LEDs are polarized — the <strong className="text-gray-200">anode</strong>{" "}
          (positive) and <strong className="text-gray-200">cathode</strong>{" "}
          (negative) legs are not interchangeable. On a through-hole
          LED you can tell them apart two ways:
        </p>

        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
          <li>The <strong className="text-gray-200">longer lead</strong> is the anode (+).</li>
          <li>The <strong className="text-gray-200">flat edge</strong> on the plastic rim marks the cathode (−).</li>
        </ul>

        <Note>
          Plug an LED in backwards and nothing happens — no current
          flows. It won't damage the LED for a normal 5 V supply, but
          it won't light up either. Flip it and try again.
        </Note>
      </Section>

      <Section title="Why they need a resistor">
        <p className="text-sm leading-relaxed">
          An LED's current vs. voltage curve is almost vertical once you
          pass the forward voltage. A tiny change in voltage means a
          huge change in current. Connect an LED directly to 5 V and
          the current will spike past the LED's limit — it burns out
          in a flash or two.
        </p>

        <p className="text-sm leading-relaxed mt-2">
          The fix is a series <Term k="resistor">resistor</Term> that
          absorbs the leftover voltage and fixes the current. For a red
          LED on 5 V drawing ~15 mA:
        </p>

        <p className="mt-2 text-sm leading-relaxed font-mono text-gray-200">
          R = (5 − 2) V / 0.015 A = 200 Ω
        </p>

        <Figure caption="LED with series current-limiting resistor.">
          <Schematic cols={12} rows={5}>
            <Schematic.Vcc at={[1, 2]} label="+5V" />
            <Schematic.Wire points={[[1, 2], [2, 2]]} />
            <Schematic.Resistor from={[2, 2]} to={[6, 2]} label="220Ω" />
            <Schematic.Wire points={[[6, 2], [7, 2]]} />
            <Schematic.Led from={[7, 2]} to={[9, 2]} label="anode → cathode" />
            <Schematic.Wire points={[[9, 2], [9, 4]]} />
            <Schematic.Ground at={[9, 4]} />
          </Schematic>
        </Figure>

        <Warn>
          Never wire an LED directly between 5 V and ground. The
          resistor is not optional — it's the only thing protecting the
          LED from burning out.
        </Warn>
      </Section>

      <SeeAlso
        refs={[
          "electronics/resistors",
          "electronics/ohms-law",
          "programming/digital-io",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

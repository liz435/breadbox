// Electronics Fundamentals > Components > Diodes

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function DiodesPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "diodes",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Diodes"
        subtitle="One-way valves for current — they pass it in one direction and block it in the other."
      />

      <Section title="Forward vs reverse">
        <p className="text-sm leading-relaxed">
          A <Term k="diode" /> has two terminals:{" "}
          <em className="text-foreground">anode</em> (+) and{" "}
          <em className="text-foreground">cathode</em> (−, marked by
          the band on the body). Put the anode at a higher voltage
          than the cathode and current flows — the diode is{" "}
          <em className="text-foreground">forward-biased</em>. Reverse
          the voltage and almost no current flows (until you exceed
          its reverse breakdown voltage, which you shouldn't).
        </p>

        <Figure caption="Forward-biased: the triangle points toward the cathode, in the direction current flows.">
          <Schematic cols={12} rows={5}>
            <Schematic.Vcc at={[2, 1]} label="+5V" />
            <Schematic.Wire points={[[2, 1], [2, 2]]} />
            <Schematic.Wire points={[[2, 2], [4, 2]]} />
            <Schematic.Diode from={[4, 2]} to={[7, 2]} label="1N4148" />
            <Schematic.Wire points={[[7, 2], [9, 2]]} />
            <Schematic.Resistor from={[9, 2]} to={[9, 4]} label="1kΩ" />
            <Schematic.Ground at={[9, 4]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="Forward voltage drops">
        <p className="text-sm leading-relaxed">
          A forward-biased diode drops a roughly constant voltage,
          regardless of current. This is the number you plug into
          Ohm's law when sizing series resistors. Typical values:
        </p>

        <Table
          headers={["Type", "Forward drop (Vf)"]}
          rows={[
            ["Silicon small-signal (e.g. 1N4148)", "~0.7 V"],
            ["Rectifier (1N4001–1N4007)", "~0.7 V"],
            ["Schottky (e.g. 1N5817)", "~0.3 V"],
            ["Red LED", "~2.0 V"],
            ["Green / yellow LED", "~2.1 V"],
            ["Blue / white LED", "~3.0 V"],
          ]}
        />
      </Section>

      <Section title="The flyback diode">
        <p className="text-sm leading-relaxed">
          When you switch off an inductive load — a relay coil, a
          motor, a solenoid — the collapsing magnetic field
          generates a big reverse voltage spike that will happily
          destroy whatever was driving it. Place a diode across the
          coil, cathode to +V, anode to the switched side, and that
          spike has somewhere to go. The classic name is{" "}
          <em className="text-foreground">flyback diode</em> (also
          "kickback diode" or "freewheeling diode"). A 1N4001 across
          a 5 V relay coil is the canonical example.
        </p>

        <Figure caption="Flyback diode across a coil: the spike circulates through the diode instead of into the driver.">
          <Schematic cols={14} rows={6}>
            <Schematic.Vcc at={[3, 1]} label="+V" />
            <Schematic.Wire points={[[3, 1], [3, 2]]} />
            <Schematic.Junction at={[3, 2]} />
            {/* Coil (top branch) */}
            <Schematic.Resistor from={[3, 2]} to={[10, 2]} label="COIL" />
            {/* Flyback diode (bottom branch) — anode on right, cathode on left */}
            <Schematic.Wire points={[[3, 2], [3, 4]]} />
            <Schematic.Wire points={[[10, 2], [10, 4]]} />
            <Schematic.Diode from={[10, 4]} to={[3, 4]} label="1N4001" />
            {/* Load continues from right side */}
            <Schematic.Junction at={[10, 2]} />
            <Schematic.Wire points={[[10, 2], [12, 2]]} />
            <Schematic.Wire points={[[12, 2], [12, 5]]} />
            <Schematic.Ground at={[12, 5]} />
          </Schematic>
        </Figure>

        <Note>
          LEDs are themselves diodes — the "LED" in the name is
          literally "light-emitting diode." They have a much higher
          forward drop than a silicon rectifier, which is why they
          need a series resistor for a given current.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/leds",
          "electronics/ohms-law",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

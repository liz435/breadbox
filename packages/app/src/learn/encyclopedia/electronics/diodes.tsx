// Electronics Fundamentals > Components > Diodes

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
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
          <em className="text-gray-200">anode</em> (+) and{" "}
          <em className="text-gray-200">cathode</em> (−, marked by
          the band on the body). Put the anode at a higher voltage
          than the cathode and current flows — the diode is{" "}
          <em className="text-gray-200">forward-biased</em>. Reverse
          the voltage and almost no current flows (until you exceed
          its reverse breakdown voltage, which you shouldn't).
        </p>
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
          <em className="text-gray-200">flyback diode</em> (also
          "kickback diode" or "freewheeling diode"). A 1N4001 across
          a 5 V relay coil is the canonical example.
        </p>

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

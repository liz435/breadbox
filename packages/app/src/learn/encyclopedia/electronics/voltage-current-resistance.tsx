// Electronics Fundamentals > Core concepts > Voltage, current, resistance

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

export function VoltageCurrentResistancePage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "voltage-current-resistance",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Voltage, current, resistance"
        subtitle="The three quantities every beginner has to internalize, in plain language."
      />

      <Section title="The water analogy">
        <p className="text-sm leading-relaxed">
          Every electronics tutorial reaches for the same metaphor
          because it works. Picture electricity as water in a pipe:
        </p>

        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">Voltage</strong> is the
            water pressure — how hard the water is pushing on the pipe
            walls. Higher voltage, harder push.
          </li>
          <li>
            <strong className="text-gray-200">Current</strong> is how
            much water is flowing past a point per second — the actual
            volume moving through the pipe.
          </li>
          <li>
            <strong className="text-gray-200">Resistance</strong> is how
            narrow the pipe is. A pinched pipe lets less water through
            even if the pressure stays the same.
          </li>
        </ul>

        <Note>
          Voltage pushes, current flows, resistance restricts. Keep
          those three verbs in your head and every circuit diagram gets
          easier to read.
        </Note>
      </Section>

      <Section title="Units and symbols">
        <Table
          headers={["Quantity", "Unit", "Symbol", "What it measures"]}
          rows={[
            ["Voltage", "Volt (V)", "V", "Electrical pressure between two points"],
            ["Current", "Amp (A)", "I", "Rate of electric charge flow"],
            ["Resistance", "Ohm (Ω)", "R", "Opposition to current flow"],
          ]}
        />

        <p className="text-sm leading-relaxed">
          Hobby electronics rarely deal with a full amp. The common
          prefixes are milli- (1/1000) for current and kilo- (1000×) for
          resistance. A typical LED draws ~20 mA through a ~220 Ω
          resistor.
        </p>
      </Section>

      <Section title="Intuition before math">
        <p className="text-sm leading-relaxed">
          You do not need to memorize formulas to start. What matters
          first is the mental picture: if you raise the voltage, you
          push more current through the same resistor. If you raise the
          resistance, less current flows at the same voltage. These two
          facts are what the math on the next page captures.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "electronics/ohms-law",
          "electronics/power",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

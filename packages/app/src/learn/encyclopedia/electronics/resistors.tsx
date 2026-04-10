// Electronics Fundamentals > Components > Resistors

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

export function ResistorsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "resistors",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Resistors"
        subtitle="The humble color-striped cylinder that limits current in almost every hobby circuit."
      />

      <Section title="What they do">
        <p className="text-sm leading-relaxed">
          A <Term k="resistor">resistor</Term> opposes current flow by
          a fixed amount. Drop one into a circuit and{" "}
          <Term k="ohms-law">Ohm's law</Term> tells you exactly how
          much current the rest of the circuit can pull. Resistors are
          non-polar — either end goes to either side.
        </p>
      </Section>

      <Section title="Reading the color bands">
        <p className="text-sm leading-relaxed">
          Through-hole resistors are marked with colored stripes because
          the numbers would be too small to read. Four-band resistors
          have three value bands plus a tolerance band; five-band
          resistors have an extra digit for precision parts.
        </p>

        <Table
          headers={["Color", "Digit", "Multiplier"]}
          rows={[
            ["Black", "0", "×1"],
            ["Brown", "1", "×10"],
            ["Red", "2", "×100"],
            ["Orange", "3", "×1 k"],
            ["Yellow", "4", "×10 k"],
            ["Green", "5", "×100 k"],
            ["Blue", "6", "×1 M"],
            ["Violet", "7", "×10 M"],
            ["Gray", "8", "—"],
            ["White", "9", "—"],
          ]}
        />

        <p className="text-sm leading-relaxed">
          For a 4-band resistor, the first two bands give digits, the
          third is a power-of-ten multiplier, and the fourth is
          tolerance (gold = 5%, silver = 10%). Red-red-brown-gold
          decodes as 2, 2, ×10, giving 220 Ω ± 5%.
        </p>

        <Note>
          When in doubt, grab a multimeter and measure directly. Faded
          bands are the #1 reason a kit resistor gets mis-identified.
        </Note>
      </Section>

      <Section title="Standard E-series values">
        <p className="text-sm leading-relaxed">
          Resistors come in fixed "E-series" values rather than every
          possible number. The most common series for beginners is E12
          — 12 values per decade, enough for 5% tolerance parts:
        </p>

        <p className="mt-2 text-sm leading-relaxed font-mono text-gray-200">
          1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2
        </p>

        <p className="text-sm leading-relaxed mt-2">
          Multiply by 10, 100, 1 k, 10 k, etc. to get the common parts.
          220, 330, 470, 1 k, 10 k, and 100 k are in every Arduino kit
          because they cover LED limiting, pull-ups, and general
          purpose signaling.
        </p>
      </Section>

      <Section title="Power rating">
        <p className="text-sm leading-relaxed">
          Every resistor has a wattage rating — how much power it can
          dissipate before it cooks. The standard hobby size is ¼ W
          (0.25 W). For 5 V Arduino work, ¼ W is more than enough for
          any resistor above ~100 Ω. If you're switching mains voltages
          or motor loads, do the <code>P = V × I</code> math and size
          up accordingly.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "electronics/ohms-law",
          "electronics/leds",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

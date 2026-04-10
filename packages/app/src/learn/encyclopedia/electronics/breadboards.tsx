// Electronics Fundamentals > Components > Breadboards

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function BreadboardsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "breadboards",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Breadboards"
        subtitle="A grid of holes with hidden metal clips underneath — the standard way to wire a prototype."
      />

      <Section title="The anatomy">
        <p className="text-sm leading-relaxed">
          A typical half-size breadboard has two zones: a{" "}
          <strong className="text-gray-200">main area</strong> with rows
          of five holes, and two pairs of long{" "}
          <strong className="text-gray-200">power rails</strong> running
          down the sides. Underneath each row is a metal clip that
          electrically ties all five holes together into a single net.
        </p>
      </Section>

      <Section title="Rows of five">
        <p className="text-sm leading-relaxed">
          Each horizontal row in the main area has{" "}
          <strong className="text-gray-200">five holes</strong> joined
          together. Drop a wire into one hole and a component leg into
          another hole in the same row, and they're connected — no
          soldering required. Drop into the next row and they're not.
        </p>

        <Note>
          Adjacent rows are <em className="text-gray-200">not</em>{" "}
          connected. The whole point of the grid is that each row is
          its own isolated net.
        </Note>
      </Section>

      <Section title="The center gap">
        <p className="text-sm leading-relaxed">
          A gap runs down the middle of the main area, splitting every
          row into two halves of five holes each. The gap exists so
          that a <strong className="text-gray-200">DIP chip</strong>{" "}
          (the kind with two rows of legs) can straddle it — the legs
          on the left land in one row's left half, and the legs on the
          right land in the same row's right half, giving each pin its
          own isolated net.
        </p>
      </Section>

      <Section title="Power rails">
        <p className="text-sm leading-relaxed">
          The long rails down the sides are marked red (+) and blue or
          black (−). Unlike the main rows, these are continuous all the
          way down. Wire one end to your Arduino's 5 V and GND pins and
          the whole length of the rail is powered — handy for
          distributing power to multiple components.
        </p>

        <Note>
          Some longer breadboards split the power rails in the middle.
          If power works on one half of the rail but not the other,
          add a short jumper across the break.
        </Note>
      </Section>

      <Section title="The resistor-across-the-gap rule">
        <p className="text-sm leading-relaxed">
          When you're wiring a resistor in series with an LED, put each
          component on a different row, bridging the rows with the
          component's legs. A common pattern is:
        </p>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed list-disc pl-5">
          <li>Resistor straddles rows A and B (legs in two different rows).</li>
          <li>LED's anode joins the resistor in row B.</li>
          <li>LED's cathode lands in row C, which connects to the ground rail.</li>
        </ul>
        <p className="text-sm leading-relaxed mt-2">
          Bridging rows with a component is how you force current to
          flow <em className="text-gray-200">through</em> the component
          instead of skipping it.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "board/anatomy",
          "board/shield-headers",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

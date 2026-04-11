// Electronics Fundamentals > Core concepts > Short circuits

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

export function ShortsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "shorts",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Short circuits"
        subtitle="A very low resistance path that lets current go somewhere it shouldn't."
      />

      <Section title="What counts as a short">
        <p className="text-sm leading-relaxed">
          A <Term k="short">short circuit</Term> is a near-zero-resistance
          path between two points that shouldn't be connected directly.
          The classic case is a wire from the +5 V rail straight to
          ground, but any missing resistor that leaves a current path
          with nothing to slow it down counts too.
        </p>
      </Section>

      <Section title="Why shorts break things">
        <p className="text-sm leading-relaxed">
          Ohm's law says <code>I = V / R</code>. If R is practically
          zero, I gets very large — limited only by how much current the
          supply can deliver. That current has to flow{" "}
          <em className="text-gray-200">through something</em>: usually
          the thin traces in the Arduino, the USB cable, or the voltage
          regulator. Whatever it flows through heats up fast.
        </p>
      </Section>

      <Section title="The textbook example">
        <Figure caption="A wire from +5V straight to GND. Don't build this.">
          <Schematic cols={10} rows={6}>
            <Schematic.Vcc at={[2, 2]} label="+5V" />
            <Schematic.Wire points={[[2, 2], [8, 2]]} color="#ef4444" />
            <Schematic.Wire points={[[8, 2], [8, 4]]} color="#ef4444" />
            <Schematic.Ground at={[8, 4]} />
            <Schematic.Label at={[5, 1]} text="SHORT" />
          </Schematic>
        </Figure>

        <Warn>
          On a USB-powered Uno, a direct 5 V-to-GND short will trip
          your computer's USB port protection (best case) or smoke the
          regulator on the Arduino (worst case). Always unplug the
          board before rewiring, and double-check with a multimeter on
          continuity mode before powering up.
        </Warn>
      </Section>

      <Section title="Sneakier ways to make one">
        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          <li>
            Setting <strong className="text-gray-200">one pin HIGH
            and another LOW</strong> and wiring them together — the
            two output drivers fight each other.
          </li>
          <li>
            Wiring an LED with <strong className="text-gray-200">no
            current-limiting resistor</strong>. The LED itself has very
            low resistance once it turns on and acts like a short.
          </li>
          <li>
            Letting a <strong className="text-gray-200">bare wire</strong>{" "}
            fall across two rails. Stranded wire is especially good at
            this because stray strands bridge gaps.
          </li>
        </ul>
      </Section>

      <SeeAlso
        refs={[
          "electronics/power",
          "electronics/ground",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

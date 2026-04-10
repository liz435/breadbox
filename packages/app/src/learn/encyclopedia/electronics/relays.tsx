// Electronics Fundamentals > Components > Relays

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function RelaysPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "relays",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Relays"
        subtitle="A coil-driven mechanical switch that electrically isolates your 5 V logic from whatever it's switching."
      />

      <Section title="A coil and a switch">
        <p className="text-sm leading-relaxed">
          A <Term k="relay" /> is two things in one package: an
          electromagnet (the coil) and a mechanical switch whose
          contacts are moved by the magnet. Energise the coil
          and the switch flips; de-energise it and a spring
          flips it back. The coil and the switched contacts are
          completely separate circuits — you can switch 240 V AC
          with a 5 V coil, because the only thing moving between
          the two sides is a magnetic field.
        </p>

        <p className="text-sm leading-relaxed">
          That isolation is the headline feature. A{" "}
          <Term k="transistor" /> is electrically faster and
          cheaper, but the load and the control signal share a
          ground. A relay's load and control signal don't share
          anything. For switching mains AC, or for isolating a
          noisy motor from your logic rails, that matters a lot.
        </p>
      </Section>

      <Section title="Active-high, active-low">
        <p className="text-sm leading-relaxed">
          Cheap relay modules already include a driver
          transistor, a flyback diode, and an optocoupler for
          extra isolation. They come in two flavours: the
          "active-HIGH" kind energises the coil when the input
          pin is HIGH, and the "active-LOW" kind does the
          opposite. Active-LOW modules are slightly more common
          because they put the relay in a safe state on boot
          while the Arduino's pins are still floating. Check the
          board's label or try both and see which way round your
          sketch needs to drive the pin.
        </p>
      </Section>

      <Section title="The flyback diode">
        <p className="text-sm leading-relaxed">
          When you cut power to the coil, its collapsing
          magnetic field generates a big reverse voltage spike.
          That spike will happily destroy whatever was driving
          the coil. A diode placed across the coil — cathode to
          the positive supply, anode to the switched side —
          gives the spike a harmless loop to dissipate through.
          See the diodes page for the full story. Relay modules
          already have this diode on them; bare relays do not.
        </p>

        <Warn>
          Mains AC is dangerous. If a project must switch AC
          loads, use a fully-assembled, certified relay module
          with opto-isolation and enclose any exposed AC
          terminals. Don't improvise mains wiring on a
          breadboard — see the AC safety page.
        </Warn>

        <Note>
          Relays are slow (milliseconds to switch) and wear out
          over many cycles. For fast switching or long lifetimes,
          reach for a MOSFET or a solid-state relay.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/diodes",
          "electronics/transistors",
          "electronics/ac-safety",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

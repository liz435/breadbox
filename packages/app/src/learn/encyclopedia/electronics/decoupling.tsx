// Electronics Fundamentals > Core concepts > Noise and decoupling

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function DecouplingPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "decoupling",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Noise and decoupling"
        subtitle="Every IC gets a tiny capacitor between its power pins and ground, sitting as close to the chip as possible."
      />

      <Section title="Where the noise comes from">
        <p className="text-sm leading-relaxed">
          Digital chips switch their outputs fast. When a bank of
          pins flips HIGH at the same instant, the chip yanks a
          burst of current off the 5 V rail for a few
          nanoseconds. The wires and traces between the supply
          and the chip have a tiny amount of inductance, so that
          sudden pull on current causes a sudden dip in the
          voltage right at the chip's power pins. A single dip
          sounds harmless, but at the speed modern logic switches
          it's enough to confuse inputs, corrupt clocks, or reset
          the chip.
        </p>
      </Section>

      <Section title="The decoupling capacitor">
        <p className="text-sm leading-relaxed">
          The cure is a small{" "}
          <Term k="decoupling">decoupling capacitor</Term> — a{" "}
          <code>0.1 µF</code> ceramic — placed physically right
          next to the chip, one per VCC pin, with the shortest
          possible path to ground. The cap acts as a local
          charge reservoir. When the chip suddenly needs current,
          it pulls it from the cap, which is centimetres away,
          instead of from the power supply which is tens of
          centimetres away. By the time the supply catches up,
          the cap has already supplied the burst and is being
          topped back up.
        </p>

        <p className="text-sm leading-relaxed">
          Bigger reservoirs go elsewhere. A 10 µF or 47 µF
          electrolytic near the power connector smooths the
          slower sags across the whole board. The small ceramic
          near each chip handles the fast transients the big
          electrolytic can't keep up with.
        </p>
      </Section>

      <Section title="Why close actually means close">
        <p className="text-sm leading-relaxed">
          Close is not a suggestion. Every extra millimetre of
          trace between the cap and the chip's power pin adds
          inductance, and inductance is exactly what the cap is
          there to fight. On a schematic the cap is just drawn
          next to the chip; on an actual PCB the designer
          spends real effort making sure the cap sits right
          against the VCC pin. If you forget the cap entirely the
          circuit <em>usually</em> still runs, which is what
          makes this a lesson that gets learned the hard way.
        </p>

        <Note>
          Dreamer does not model transient noise, so an IC
          without a decoupling cap behaves identically to one
          with. On real hardware, add the cap anyway — it's the
          cheapest insurance in electronics.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/capacitors",
          "electronics/impedance",
          "board/power-pins",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

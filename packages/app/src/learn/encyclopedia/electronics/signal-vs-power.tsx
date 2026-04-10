// Electronics Fundamentals > Core concepts > Signal vs power

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function SignalVsPowerPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "signal-vs-power",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Signal vs power"
        subtitle="Why thin jumper wires are fine for buttons but dangerous for motors."
      />

      <Section title="Two jobs, two kinds of wire">
        <p className="text-sm leading-relaxed">
          Every wire in a circuit is either carrying a{" "}
          <em className="text-gray-200">signal</em> — information
          flowing from one chip to another at microamps or less — or{" "}
          <em className="text-gray-200">power</em> — the amps and tens
          of amps that actually drive loads. They look identical on a
          schematic, but they have very different physical
          requirements.
        </p>
      </Section>

      <Section title="Why current matters physically">
        <p className="text-sm leading-relaxed">
          Every real wire has a tiny but nonzero resistance. Ohm's
          law says the voltage dropped across that resistance is{" "}
          <code className="text-gray-200">V = I × R</code>, and the
          power dissipated as heat is{" "}
          <code className="text-gray-200">P = I² × R</code>. Both
          scale with current: double the amps and you lose twice the
          voltage and four times the heat. A 1 mA signal through a
          long thin wire loses nothing worth measuring. A 2 A motor
          current through the same wire can drop half a volt, get
          warm enough to burn you, and upset nearby signals.
        </p>
      </Section>

      <Section title="Practical rule of thumb">
        <p className="text-sm leading-relaxed">
          The flimsy 22-gauge jumper wires in an Arduino starter kit
          are fine for anything below roughly{" "}
          <em className="text-gray-200">100 mA</em> — that covers
          every digital signal, every button, every sensor, and a
          handful of LEDs. Above that, use thicker wire: a real motor
          lead, a terminal-block connection, or at least doubled-up
          jumpers. Anything over an amp wants dedicated power wire.
        </p>

        <Note>
          The other tell: if a wire is getting warm to the touch,
          it's too thin for the current it's carrying. Stop and
          upsize before something melts.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/power",
          "electronics/wires",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

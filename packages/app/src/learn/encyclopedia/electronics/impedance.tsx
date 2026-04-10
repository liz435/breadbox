// Electronics Fundamentals > Core concepts > Impedance, hand-wavingly

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

export function ImpedancePage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "impedance",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Impedance, hand-wavingly"
        subtitle="Like resistance, but it works on signals that change over time."
      />

      <Section title="Resistance only tells part of the story">
        <p className="text-sm leading-relaxed">
          A resistor has the same opposition to current whether
          you push DC through it or a 1 kHz sine wave. A capacitor
          and an inductor don't. A capacitor blocks DC entirely
          and passes high-frequency AC almost freely. An inductor
          does the opposite — it passes DC but resists rapid
          changes. <em>Resistance</em>, as in Ohm's law, only
          captures the steady-state part of what those components
          do.
        </p>
      </Section>

      <Section title="Impedance in one sentence">
        <p className="text-sm leading-relaxed">
          <Term k="impedance" /> — written Z — is the same idea as
          resistance, generalised so it can also describe how a
          component opposes a signal that's changing over time.
          It's still measured in ohms. For a plain{" "}
          <Term k="resistor" />, Z = R and that's the end of the
          story. For a <Term k="capacitor" /> or an inductor, Z
          depends on the frequency of the signal you're pushing
          through it.
        </p>

        <p className="text-sm leading-relaxed">
          A capacitor has high impedance at low frequencies
          (hard to push slow signals through) and low impedance
          at high frequencies (easy to push fast signals through).
          That's why the 0.1 µF cap next to every IC can absorb
          fast switching noise without draining the steady power
          rail: it's a short circuit for the noise and an open
          circuit for the DC.
        </p>
      </Section>

      <Section title="When you'll meet it">
        <p className="text-sm leading-relaxed">
          Three common phrases use the word: "high-impedance
          input" means the pin draws so little current that
          upstream circuitry barely notices it (Arduino analog
          inputs are like this). "Impedance mismatch" means two
          parts of a system are designed for different source or
          load resistances, and signals get distorted at the
          boundary. "Output impedance" is the effective source
          resistance looking back into a driver — a stiff 5 V
          rail has very low output impedance; a battery running
          flat has high output impedance and its voltage sags
          under load.
        </p>

        <Note>
          Real impedance math uses complex numbers and AC
          analysis. For an Arduino project you almost never need
          that; the intuition above gets you through.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/ohms-law",
          "electronics/capacitors",
          "electronics/decoupling",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

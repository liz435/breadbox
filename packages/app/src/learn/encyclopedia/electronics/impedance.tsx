// Electronics Fundamentals > Core concepts > Impedance, hand-wavingly

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Figure,
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

        <Figure caption="How impedance varies with signal frequency for the three basic passive components.">
          <ImpedanceCurves />
        </Figure>
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

// ── Impedance vs frequency diagram ─────────────────────────────────────

function ImpedanceCurves() {
  const w = 460
  const h = 220
  const ox = 60
  const oy = 180
  const plotW = 360
  const plotH = 140

  // Generate curves on a log-frequency x axis
  const samples = 100
  const curve = (fn: (t: number) => number) => {
    const pts: [number, number][] = []
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const y = Math.max(0, Math.min(1, fn(t)))
      pts.push([ox + t * plotW, oy - y * plotH])
    }
    return pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0]} ${pt[1]}`).join(" ")
  }

  const resistor = curve(() => 0.5) // flat
  const capacitor = curve((t) => 0.95 - t * 0.92) // decreasing
  const inductor = curve((t) => 0.05 + t * 0.92) // increasing

  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />
        {/* Axes */}
        <line x1={ox} y1={oy} x2={ox + plotW} y2={oy} stroke="#6b7280" strokeWidth={1.2} />
        <line x1={ox} y1={oy} x2={ox} y2={oy - plotH - 10} stroke="#6b7280" strokeWidth={1.2} />
        <text x={ox - 10} y={oy - plotH} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">|Z|</text>
        <text x={ox + plotW} y={oy + 14} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">frequency →</text>

        {/* Curves */}
        <path d={resistor} fill="none" stroke="#60a5fa" strokeWidth={2} />
        <path d={capacitor} fill="none" stroke="#a78bfa" strokeWidth={2} />
        <path d={inductor} fill="none" stroke="#f59e0b" strokeWidth={2} />

        {/* Legend */}
        <g transform={`translate(${ox + 14}, 24)`}>
          <line x1={0} y1={0} x2={18} y2={0} stroke="#60a5fa" strokeWidth={2} />
          <text x={24} y={4} fontSize={10} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">Resistor (flat)</text>
          <line x1={0} y1={16} x2={18} y2={16} stroke="#a78bfa" strokeWidth={2} />
          <text x={24} y={20} fontSize={10} fill="#a78bfa" fontFamily="ui-monospace, Menlo, monospace">Capacitor (↓ with f)</text>
          <line x1={0} y1={32} x2={18} y2={32} stroke="#f59e0b" strokeWidth={2} />
          <text x={24} y={36} fontSize={10} fill="#f59e0b" fontFamily="ui-monospace, Menlo, monospace">Inductor (↑ with f)</text>
        </g>
      </svg>
    </div>
  )
}

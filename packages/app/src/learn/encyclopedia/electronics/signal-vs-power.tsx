// Electronics Fundamentals > Core concepts > Signal vs power

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
          <em className="text-foreground">signal</em> — information
          flowing from one chip to another at microamps or less — or{" "}
          <em className="text-foreground">power</em> — the amps and tens
          of amps that actually drive loads. They look identical on a
          schematic, but they have very different physical
          requirements.
        </p>
      </Section>

      <Section title="Why current matters physically">
        <p className="text-sm leading-relaxed">
          Every real wire has a tiny but nonzero resistance. Ohm's
          law says the voltage dropped across that resistance is{" "}
          <code className="text-foreground">V = I × R</code>, and the
          power dissipated as heat is{" "}
          <code className="text-foreground">P = I² × R</code>. Both
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
          <em className="text-foreground">100 mA</em> — that covers
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

        <Figure caption="Same length, very different jobs. The thin line moves information; the thick line moves energy.">
          <SignalVsPowerDiagram />
        </Figure>
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

// ── Signal vs power wire diagram ───────────────────────────────────────

function SignalVsPowerDiagram() {
  const w = 460
  const h = 180
  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />
        {/* Signal wire */}
        <text x={30} y={42} fontSize={11} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">Signal wire</text>
        <line x1={30} y1={60} x2={w - 30} y2={60} stroke="#60a5fa" strokeWidth={1.2} />
        <text x={w - 30} y={48} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">~1 mA</text>
        {/* Thin arrow */}
        <line x1={220} y1={60} x2={244} y2={60} stroke="#60a5fa" strokeWidth={1.2} />
        <polyline points={`238,56 244,60 238,64`} fill="none" stroke="#60a5fa" strokeWidth={1.2} strokeLinejoin="round" />

        {/* Power wire */}
        <text x={30} y={112} fontSize={11} fill="#ef4444" fontFamily="ui-monospace, Menlo, monospace">Power wire</text>
        <line x1={30} y1={132} x2={w - 30} y2={132} stroke="#ef4444" strokeWidth={10} strokeLinecap="round" />
        <text x={w - 30} y={118} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">~2 A</text>
        {/* Fat arrows */}
        {[180, 210, 240].map((x) => (
          <g key={x}>
            <line x1={x} y1={132} x2={x + 18} y2={132} stroke="#fca5a5" strokeWidth={3} strokeLinecap="round" />
            <polyline points={`${x + 12},${126} ${x + 18},${132} ${x + 12},${138}`} fill="none" stroke="#fca5a5" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}

        <text x={w / 2} y={166} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily="ui-monospace, Menlo, monospace">
          P = I² × R — doubling the current quadruples the heat in the same wire
        </text>
      </svg>
    </div>
  )
}

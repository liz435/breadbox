// Electronics Fundamentals > Practical > Safety around AC and high current

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function AcSafetyPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "ac-safety",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Safety around AC and high current"
        subtitle="Dreamer stops at 5 V DC on purpose. Your first project switching mains voltage should not be a solo one."
      />

      <Section title="Why 5 V DC is friendly">
        <p className="text-sm leading-relaxed">
          Everything you do in the Dreamer editor is a small
          amount of direct current at 5 V or less. At those
          voltages, your skin resistance is high enough that
          even if you touch a bare wire it's uncomfortable at
          worst. Shorting the 5 V rail to ground makes a spark
          and maybe releases magic smoke from a component, but
          it won't hurt you. This is what "beginner-safe"
          actually means.
        </p>
      </Section>

      <Section title="Mains AC is a different world">
        <p className="text-sm leading-relaxed">
          Mains AC — 120 V in North America, 230 V in most of
          the rest of the world — crosses the threshold where
          a fault becomes a threat to your life, your house, or
          both. A shock from mains can stop your heart. A
          short on mains can start a fire in the wiring inside
          a wall before you notice anything is wrong. The
          techniques that kept you safe on a breadboard at 5 V
          do not scale up.
        </p>

        <Warn>
          Do not prototype mains AC on a breadboard. Do not
          make your own mains power cables. Do not run mains
          wires next to low-voltage signal wires. Do not work
          on a mains project alone the first time you try one.
        </Warn>

        <Figure caption="Mains AC — hundreds of volts swinging dozens of times per second. Not something to prototype on a breadboard.">
          <AcWarningDiagram />
        </Figure>
      </Section>

      <Section title="The safer path">
        <p className="text-sm leading-relaxed">
          When a project genuinely needs to switch a lamp or an
          appliance, use a pre-built relay module rated and
          certified for the voltage and current you need. Look
          for a UL, CSA, or CE marking on the module and on
          the enclosure. Put every exposed mains terminal
          inside a grounded enclosure before you plug the
          thing in. Better yet, let the 5 V side drive a smart
          plug — an off-the-shelf, certified device that lives
          in a sealed mains-rated case and talks to your
          Arduino over Wi-Fi or radio. Your project gets to
          switch the load without you building a mains circuit
          at all.
        </p>

        <Note>
          High-current DC has its own hazards even below mains
          voltage — a 12 V car battery can weld a screwdriver
          to a wrench. "Low voltage" and "low current" are not
          the same thing. See the current limits page.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/relays",
          "electronics/beginner-mistakes",
          "electronics/current-limits",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── AC safety warning diagram ──────────────────────────────────────────

function AcWarningDiagram() {
  const w = 480
  const h = 200
  const cx = 100
  const cy = 100
  // Warning triangle
  const triSize = 70
  const triPath = `M ${cx} ${cy - triSize} L ${cx + triSize * 0.87} ${cy + triSize * 0.5} L ${cx - triSize * 0.87} ${cy + triSize * 0.5} Z`

  // Sine wave
  const plotX = 230
  const plotY = 100
  const plotW = 220
  const amp = 50
  const wavePts: [number, number][] = []
  const samples = 120
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const x = plotX + t * plotW
    const y = plotY - Math.sin(t * Math.PI * 4) * amp
    wavePts.push([x, y])
  }
  const waveD = wavePts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0]} ${pt[1]}`).join(" ")

  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />

        {/* Warning triangle */}
        <path d={triPath} fill="#f59e0b" fillOpacity={0.18} stroke="#f59e0b" strokeWidth={3} strokeLinejoin="round" />
        {/* Lightning bolt */}
        <path
          d={`M ${cx + 4} ${cy - 28} L ${cx - 12} ${cy + 4} L ${cx - 2} ${cy + 4} L ${cx - 10} ${cy + 30} L ${cx + 14} ${cy - 8} L ${cx + 2} ${cy - 8} L ${cx + 10} ${cy - 28} Z`}
          fill="#f59e0b"
          stroke="#f59e0b"
          strokeWidth={1}
          strokeLinejoin="round"
        />

        {/* Sine wave */}
        <line x1={plotX} y1={plotY} x2={plotX + plotW} y2={plotY} stroke="#1f2937" strokeWidth={0.8} strokeDasharray="3 3" />
        <path d={waveD} fill="none" stroke="#ef4444" strokeWidth={2} />
        <text x={plotX + plotW / 2} y={plotY - amp - 10} textAnchor="middle" fontSize={12} fill="#ef4444" fontFamily="ui-monospace, Menlo, monospace">
          120 / 240 V RMS
        </text>
        <text x={plotX + plotW / 2} y={plotY + amp + 22} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">
          50 / 60 Hz — DO NOT PROTOTYPE
        </text>
      </svg>
    </div>
  )
}

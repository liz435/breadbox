// Electronics Fundamentals > Signals > Analog vs digital signals

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

export function AnalogVsDigitalPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "analog-vs-digital",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Analog vs digital signals"
        subtitle="Continuous voltages vs discrete ones — and how the Arduino turns the first into the second."
      />

      <Section title="Two ways to carry information">
        <p className="text-sm leading-relaxed">
          An <em className="text-gray-200">analog</em> signal is a
          voltage that can take any value within some range — a
          temperature sensor might output 0.24 V, or 0.247 V, or
          2.999 V. A <em className="text-gray-200">digital</em>{" "}
          signal only takes two values that the chip agrees to call
          HIGH (roughly 5 V on the Uno) and LOW (roughly 0 V).
          Anything in between is ambiguous and gets snapped to the
          nearest legal level.
        </p>
      </Section>

      <Section title="The ADC quantizes the analog world">
        <p className="text-sm leading-relaxed">
          To read an analog voltage from code you need a converter
          that turns it into a number. The Uno's{" "}
          <Term k="adc">analog-to-digital converter</Term> is 10
          bits wide, which means it maps the 0–5 V range onto the
          integers from 0 to 1023 — 1024 discrete steps total. Each
          step represents a voltage of about{" "}
          <code className="text-gray-200">5 V / 1024 ≈ 4.9 mV</code>
          . A reading of 512 means "somewhere between 2.495 V and
          2.500 V" — you can't tell the two apart.
        </p>

        <Figure caption="Left: smooth analog waveform. Right: the same wave after 10-bit quantization — every sample snaps to one of 1024 legal steps.">
          <AnalogDigitalDiagram />
        </Figure>
      </Section>

      <Section title="Why it matters">
        <p className="text-sm leading-relaxed">
          The 4.9 mV resolution limit is why sensor projects stack
          filters and smoothing on top of <code>analogRead()</code>:
          the underlying conversion is both quantized and noisy.
          It's also why a 3.3 V sensor connected to a 5 V-referenced
          ADC wastes a third of its range — you'll never see
          readings above ~676. For inputs that swing over less than
          the full 0–5 V, either scale them up first (op-amp gain
          stage) or change the ADC reference.
        </p>

        <Note>
          Digital isn't a magic improvement — it's a tradeoff. You
          give up precision and get noise immunity: a 5 V logic "1"
          is still a 1 after a few volts of noise. Analog is the
          other way around.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/analog-pins",
          "programming/analog-io",
          "electronics/voltage-dividers",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Analog vs digital waveform diagram ─────────────────────────────────

function AnalogDigitalDiagram() {
  const w = 460
  const h = 180
  const plotW = 200
  const plotH = 120
  const topY = 40
  const leftX = 20
  const rightX = w - leftX - plotW
  const steps = 16 // visual quantization
  const analogPts: [number, number][] = []
  const digitalPts: [number, number][] = []
  const samples = 80
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const v = 0.5 + 0.45 * Math.sin(t * Math.PI * 2)
    analogPts.push([leftX + t * plotW, topY + plotH - v * plotH])
    const quant = Math.round(v * steps) / steps
    digitalPts.push([rightX + t * plotW, topY + plotH - quant * plotH])
  }
  const analogD = analogPts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0]} ${pt[1]}`).join(" ")
  // Stair-step path
  const stairPts: [number, number][] = []
  for (let i = 0; i < digitalPts.length; i++) {
    const cur = digitalPts[i]!
    if (i === 0) {
      stairPts.push(cur)
    } else {
      const prev = digitalPts[i - 1]!
      stairPts.push([cur[0], prev[1]])
      stairPts.push(cur)
    }
  }
  const stairD = stairPts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0]} ${pt[1]}`).join(" ")

  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />
        {/* Axes left */}
        <line x1={leftX} y1={topY + plotH} x2={leftX + plotW} y2={topY + plotH} stroke="#6b7280" strokeWidth={1} />
        <line x1={leftX} y1={topY} x2={leftX} y2={topY + plotH} stroke="#6b7280" strokeWidth={1} />
        <path d={analogD} fill="none" stroke="#60a5fa" strokeWidth={2} />
        <text x={leftX + plotW / 2} y={topY - 12} textAnchor="middle" fontSize={11} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">
          Analog (continuous)
        </text>
        {/* Axes right */}
        <line x1={rightX} y1={topY + plotH} x2={rightX + plotW} y2={topY + plotH} stroke="#6b7280" strokeWidth={1} />
        <line x1={rightX} y1={topY} x2={rightX} y2={topY + plotH} stroke="#6b7280" strokeWidth={1} />
        {/* Faint quantization grid */}
        {Array.from({ length: steps + 1 }, (_, i) => (
          <line
            key={i}
            x1={rightX}
            y1={topY + (i / steps) * plotH}
            x2={rightX + plotW}
            y2={topY + (i / steps) * plotH}
            stroke="#1f2937"
            strokeWidth={0.6}
          />
        ))}
        <path d={stairD} fill="none" stroke="#a78bfa" strokeWidth={2} />
        <text x={rightX + plotW / 2} y={topY - 12} textAnchor="middle" fontSize={11} fill="#a78bfa" fontFamily="ui-monospace, Menlo, monospace">
          Digital (quantized)
        </text>
      </svg>
    </div>
  )
}

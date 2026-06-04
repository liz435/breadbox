// Electronics Fundamentals > Signals > 1-Wire

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

export function OneWirePage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "one-wire",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="1-Wire"
        subtitle="A single data line does double duty — it both powers the peripheral and carries bidirectional data."
      />

      <Section title="One line for everything">
        <p className="text-sm leading-relaxed">
          1-Wire and its relatives are the minimalist end of the
          bus spectrum. A sensor gets two connections to the
          Arduino: ground and a single data pin. That data pin
          carries every transaction in both directions, and in
          "parasitic power" mode it also trickle-charges a tiny
          capacitor inside the sensor so the sensor doesn't
          need a dedicated VCC wire at all. You still want a
          4.7 kΩ pull-up on the data line so it floats HIGH when
          nobody is talking.
        </p>
      </Section>

      <Section title="Where you'll meet it">
        <p className="text-sm leading-relaxed">
          The canonical 1-Wire part is the Dallas DS18B20
          digital temperature sensor. You can string several of
          them on one wire, each identified by a unique 64-bit
          ROM code burned in at the factory, and ask each one
          in turn for a temperature reading. DHT11 and DHT22
          humidity sensors are close cousins — they use a
          single data line with a custom protocol rather than
          strict 1-Wire, but the wiring looks the same and the
          software libraries treat them similarly.
        </p>
      </Section>

      <Section title="What the line looks like">
        <p className="text-sm leading-relaxed">
          Timing is tight. A master pulls the line LOW for a
          precise number of microseconds to signal "send me a
          0" or "send me a 1", then releases it and samples
          what the sensor does. This is why libraries like
          OneWire and DHT do the bit-banging for you — getting
          the timing wrong by a few microseconds causes the
          transaction to fail silently and the sensor to return
          garbage.
        </p>

        <Figure caption="One single line carries everything — idle HIGH, pulled LOW for each bit, timing determines whether it's a 1 or a 0.">
          <OneWireTiming />
        </Figure>

        <Note>
          The 4.7 kΩ pull-up between the data line and VCC is
          not optional. Breadbox hides this when it models a
          DHT sensor, but on real hardware the circuit simply
          does not work without it.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/dht-library",
          "electronics/pull-ups",
          "electronics/i2c-concepts",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── 1-Wire timing diagram ──────────────────────────────────────────────

function OneWireTiming() {
  const w = 460
  const h = 180
  const highY = 60
  const lowY = 120
  const startX = 40
  const endX = w - 20
  // Pulse train: idle, short LOW (1 bit), idle, long LOW (0 bit), idle
  const segments: { x: number; y: number }[] = [
    { x: startX, y: highY },
    { x: 90, y: highY },
    { x: 90, y: lowY },
    { x: 110, y: lowY },
    { x: 110, y: highY },
    { x: 180, y: highY },
    { x: 180, y: lowY },
    { x: 240, y: lowY },
    { x: 240, y: highY },
    { x: 310, y: highY },
    { x: 310, y: lowY },
    { x: 330, y: lowY },
    { x: 330, y: highY },
    { x: endX, y: highY },
  ]
  const d = segments.map((s, i) => `${i === 0 ? "M" : "L"} ${s.x} ${s.y}`).join(" ")
  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />
        {/* Level labels */}
        <line x1={startX} y1={highY} x2={endX} y2={highY} stroke="#1f2937" strokeWidth={0.8} strokeDasharray="2 3" />
        <line x1={startX} y1={lowY} x2={endX} y2={lowY} stroke="#1f2937" strokeWidth={0.8} strokeDasharray="2 3" />
        <text x={startX - 6} y={highY + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">HIGH</text>
        <text x={startX - 6} y={lowY + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">LOW</text>

        {/* Waveform */}
        <path d={d} fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinejoin="miter" />

        {/* Bit labels */}
        <text x={100} y={lowY + 20} textAnchor="middle" fontSize={10} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">"1"</text>
        <text x={210} y={lowY + 20} textAnchor="middle" fontSize={10} fill="#a78bfa" fontFamily="ui-monospace, Menlo, monospace">"0"</text>
        <text x={320} y={lowY + 20} textAnchor="middle" fontSize={10} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">"1"</text>

        {/* Header */}
        <text x={w / 2} y={30} textAnchor="middle" fontSize={11} fill="#d1d5db" fontFamily="ui-monospace, Menlo, monospace">
          Data and power share the same line
        </text>
      </svg>
    </div>
  )
}

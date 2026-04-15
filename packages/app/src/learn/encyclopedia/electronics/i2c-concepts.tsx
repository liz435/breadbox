// Electronics Fundamentals > Signals > I2C concepts

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

export function I2cConceptsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "i2c-concepts",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="I2C concepts"
        subtitle="A two-wire bus shared by up to 127 peripherals, each picked out by a 7-bit address."
      />

      <Section title="Two wires, one master">
        <p className="text-sm leading-relaxed">
          <Term k="i2c" /> (pronounced "eye-squared-see") carries
          data on two shared lines: SDA (serial data) and SCL
          (serial clock). One device on the bus is the master —
          on an Arduino project that's almost always the Arduino
          itself — and every other device is a peripheral. The
          master drives the clock, decides who gets to speak,
          and initiates every transaction.
        </p>

        <p className="text-sm leading-relaxed">
          Data goes in both directions on SDA, but only one
          party at a time. That's enough to read a sensor, set a
          register on a display driver, or stream bytes to an
          RTC, all over the same pair of wires.
        </p>

        <Figure caption="One master and two peripherals share SDA and SCL. The pull-ups let any device drag the line LOW without a fight.">
          <I2cBusTopology />
        </Figure>
      </Section>

      <Section title="Addresses">
        <p className="text-sm leading-relaxed">
          Every peripheral has a 7-bit address hard-wired at the
          factory, though many parts let you flip one or two
          bits with solder jumpers so you can put more than one
          of the same chip on one bus. The master starts a
          transaction by sending the address; the matching
          peripheral acknowledges, and the rest of the bytes
          belong to it. Any other peripheral that heard a
          different address ignores the exchange.
        </p>
      </Section>

      <Section title="Open-drain and pull-ups">
        <p className="text-sm leading-relaxed">
          Both SDA and SCL are open-drain. A device can pull the
          line LOW, but nothing on the bus ever drives it HIGH —
          the lines float up through external{" "}
          <Term k="pull-up" /> resistors, typically 4.7 kΩ to
          10 kΩ. This is what lets multiple devices share one
          line without fighting: the worst that can happen when
          two talk at once is the line gets pulled LOW, which
          the master can detect. If your bus has no pull-ups at
          all, it simply does not work. Most breakout boards
          include them.
        </p>

        <Note>
          The bus was invented for slow on-board communication
          (standard mode is 100 kbit/s) and lives happily up to
          400 kbit/s in "fast mode". It is not the right choice
          when you need megabits — reach for SPI instead.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/i2c",
          "electronics/pull-ups",
          "electronics/spi-concepts",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── I2C bus topology diagram ───────────────────────────────────────────

function I2cBusTopology() {
  const w = 500
  const h = 240
  const sdaY = 70
  const sclY = 110
  const busStart = 90
  const busEnd = w - 30
  const devices = [
    { x: 130, label: "Master", sub: "(Uno)", color: "#60a5fa" },
    { x: 260, label: "Slave", sub: "0x3C", color: "#a78bfa" },
    { x: 390, label: "Slave", sub: "0x68", color: "#10b981" },
  ]
  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />
        {/* +V rail */}
        <line x1={30} y1={30} x2={busEnd} y2={30} stroke="#ef4444" strokeWidth={1.4} />
        <text x={30} y={22} fontSize={10} fill="#ef4444" fontFamily="ui-monospace, Menlo, monospace">+5V</text>
        {/* Pull-up resistors (simplified as zig-zag boxes) */}
        <g>
          <line x1={50} y1={30} x2={50} y2={40} stroke="#9ca3af" strokeWidth={1.4} />
          <rect x={44} y={40} width={12} height={20} fill="#0f0f0f" stroke="#9ca3af" strokeWidth={1.4} />
          <line x1={50} y1={60} x2={50} y2={sdaY} stroke="#9ca3af" strokeWidth={1.4} />
          <text x={58} y={54} fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">4.7kΩ</text>
          <line x1={72} y1={30} x2={72} y2={80} stroke="#9ca3af" strokeWidth={1.4} />
          <rect x={66} y={80} width={12} height={20} fill="#0f0f0f" stroke="#9ca3af" strokeWidth={1.4} />
          <line x1={72} y1={100} x2={72} y2={sclY} stroke="#9ca3af" strokeWidth={1.4} />
          <text x={80} y={94} fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">4.7kΩ</text>
        </g>

        {/* SDA bus */}
        <line x1={busStart} y1={sdaY} x2={busEnd} y2={sdaY} stroke="#60a5fa" strokeWidth={2} />
        <text x={busEnd + 4} y={sdaY + 4} fontSize={10} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">SDA</text>
        {/* SCL bus */}
        <line x1={busStart} y1={sclY} x2={busEnd} y2={sclY} stroke="#f59e0b" strokeWidth={2} />
        <text x={busEnd + 4} y={sclY + 4} fontSize={10} fill="#f59e0b" fontFamily="ui-monospace, Menlo, monospace">SCL</text>

        {/* Devices */}
        {devices.map((d) => (
          <g key={d.label + d.sub}>
            <line x1={d.x - 8} y1={sdaY} x2={d.x - 8} y2={150} stroke="#60a5fa" strokeWidth={1.2} />
            <line x1={d.x + 8} y1={sclY} x2={d.x + 8} y2={150} stroke="#f59e0b" strokeWidth={1.2} />
            <rect x={d.x - 34} y={150} width={68} height={48} rx={4} fill="#1f2937" stroke={d.color} strokeWidth={1.6} />
            <text x={d.x} y={172} textAnchor="middle" fontSize={11} fill={d.color} fontFamily="ui-monospace, Menlo, monospace">
              {d.label}
            </text>
            <text x={d.x} y={188} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">
              {d.sub}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

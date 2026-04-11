// Electronics Fundamentals > Signals > SPI concepts

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function SpiConceptsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "spi-concepts",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="SPI concepts"
        subtitle="Four wires, full-duplex, and much faster than I2C — one peripheral active at a time."
      />

      <Section title="The four wires">
        <p className="text-sm leading-relaxed">
          <Term k="spi" /> runs on four lines: SCK (clock, from
          master), MOSI (master-out-slave-in), MISO
          (master-in-slave-out), and SS (slave-select, active
          LOW, one per peripheral). The master drives the clock
          and the SS line for whichever peripheral it wants to
          talk to; on every clock edge, a bit goes out on MOSI
          and a bit comes back on MISO simultaneously. That's
          what "full-duplex" means — bytes flow in both
          directions on the same clock.
        </p>

        <Table
          headers={["Line", "Direction", "Role"]}
          rows={[
            ["SCK", "Master → peripheral", "Clock"],
            ["MOSI", "Master → peripheral", "Master out, slave in"],
            ["MISO", "Peripheral → master", "Master in, slave out"],
            ["SS", "Master → peripheral", "Slave select, active LOW"],
          ]}
        />

        <Figure caption="Master and one peripheral connected by SCK, MOSI, MISO, and SS. The arrows show which side drives which line.">
          <SpiWiringDiagram />
        </Figure>
      </Section>

      <Section title="One peripheral at a time">
        <p className="text-sm leading-relaxed">
          To put two peripherals on the same bus, you share
          SCK, MOSI, and MISO across both and give each its own
          SS line on a separate digital pin. The master pulls
          the chosen SS LOW, clocks the bytes for that
          peripheral, then releases SS back HIGH before
          selecting the next one. Because there are no
          addresses, SPI peripherals can be simpler and faster
          than I2C ones — the chip only listens when its SS is
          asserted.
        </p>
      </Section>

      <Section title="Faster than I2C">
        <p className="text-sm leading-relaxed">
          SPI has no open-drain requirement, no pull-ups, no
          addressing overhead, and the lines are actively driven
          both HIGH and LOW. That lets it run much faster — the
          Uno's hardware SPI hits 8 MHz comfortably, compared
          with 100–400 kHz for I2C. The price is more wires and
          the need for a dedicated pin per peripheral.
        </p>

        <Note>
          SPI comes in a few "modes" that differ in which clock
          edge samples data and what the clock idles at. You
          rarely need to worry about this — use the mode the
          peripheral's datasheet specifies, which is usually
          mode 0.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/spi",
          "electronics/i2c-concepts",
          "programming/shift-out-in",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── SPI wiring diagram ─────────────────────────────────────────────────

function SpiWiringDiagram() {
  const w = 500
  const h = 230
  const masterX = 60
  const slaveX = 320
  const boxW = 120
  const boxH = 170
  const boxY = 30
  const lines = [
    { y: 60, label: "SCK",  color: "#60a5fa", direction: "→" },
    { y: 100, label: "MOSI", color: "#a78bfa", direction: "→" },
    { y: 140, label: "MISO", color: "#10b981", direction: "←" },
    { y: 180, label: "SS",   color: "#f59e0b", direction: "→" },
  ]
  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />
        {/* Master box */}
        <rect x={masterX} y={boxY} width={boxW} height={boxH} rx={4} fill="#1f2937" stroke="#60a5fa" strokeWidth={1.8} />
        <text x={masterX + boxW / 2} y={boxY + 24} textAnchor="middle" fontSize={13} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">Master</text>
        <text x={masterX + boxW / 2} y={boxY + 38} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">(Arduino)</text>

        {/* Slave box */}
        <rect x={slaveX} y={boxY} width={boxW} height={boxH} rx={4} fill="#1f2937" stroke="#a78bfa" strokeWidth={1.8} />
        <text x={slaveX + boxW / 2} y={boxY + 24} textAnchor="middle" fontSize={13} fill="#a78bfa" fontFamily="ui-monospace, Menlo, monospace">Slave</text>
        <text x={slaveX + boxW / 2} y={boxY + 38} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">(peripheral)</text>

        {/* Four lines */}
        {lines.map((ln) => {
          const x1 = masterX + boxW
          const x2 = slaveX
          const midX = (x1 + x2) / 2
          return (
            <g key={ln.label}>
              <line x1={x1} y1={ln.y} x2={x2} y2={ln.y} stroke={ln.color} strokeWidth={1.8} />
              <text x={midX} y={ln.y - 4} textAnchor="middle" fontSize={10} fill={ln.color} fontFamily="ui-monospace, Menlo, monospace">
                {ln.label}
              </text>
              {ln.direction === "→" ? (
                <polyline points={`${x2 - 8},${ln.y - 4} ${x2},${ln.y} ${x2 - 8},${ln.y + 4}`} fill="none" stroke={ln.color} strokeWidth={1.5} strokeLinejoin="round" />
              ) : (
                <polyline points={`${x1 + 8},${ln.y - 4} ${x1},${ln.y} ${x1 + 8},${ln.y + 4}`} fill="none" stroke={ln.color} strokeWidth={1.5} strokeLinejoin="round" />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

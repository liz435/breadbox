// Arduino Uno Reference > Communication > SPI on the Uno

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

export function BoardSpiPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "spi",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="SPI on the Uno"
        subtitle="Four digital pins carry a faster, full-duplex bus for a single peripheral at a time."
      />

      <Section title="The four pins">
        <p className="text-sm leading-relaxed">
          The Uno's hardware <Term k="spi" /> is wired to digital pins
          10 through 13. The master (the Uno) drives the clock, picks
          which peripheral is active with an SS (slave-select) line,
          and exchanges data with that peripheral one bit per clock.
        </p>

        <Table
          headers={["Pin", "SPI role"]}
          rows={[
            ["D10", "SS — slave select (active LOW)"],
            ["D11", "MOSI — master out, slave in"],
            ["D12", "MISO — master in, slave out"],
            ["D13", "SCK — serial clock"],
          ]}
        />

        <Figure caption="The four SPI lines between the Uno (master) and one peripheral. The master drives SCK and SS; data flows both ways on MOSI (out) and MISO (in).">
          <SpiBusDiagram />
        </Figure>
      </Section>

      <Section title="The ICSP header">
        <p className="text-sm leading-relaxed">
          The 2×3 header next to the ATmega328P labelled ICSP is the
          second copy of the SPI bus. MOSI, MISO, and SCK all appear
          on that header as well, which is how shields that need SPI
          can reach it on boards where D11–D13 get reassigned (the
          Mega, for example). For a plain Uno, the ICSP pins and
          D11/D12/D13 are the same electrical wires.
        </p>
      </Section>

      <Section title="One peripheral at a time">
        <p className="text-sm leading-relaxed">
          SPI is point-to-point in practice: one master, one active
          peripheral at a time. To talk to several peripherals, give
          each one its own SS line on a different digital pin. Pull
          the chosen one LOW, clock the bytes, then release it HIGH
          before talking to the next. D10 is only the{" "}
          <em className="text-foreground">default</em> SS — any spare
          digital pin works.
        </p>

        <Note>
          If you set D10 to INPUT while using SPI, the hardware can
          silently drop out of master mode. Keep it as OUTPUT even if
          you're using a different pin for slave-select.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/spi-concepts",
          "board/i2c",
          "board/digital-pins",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── SPI bus block diagram ──────────────────────────────────────────────

function SpiBusDiagram() {
  const w = 560
  const h = 240
  const boxW = 130
  const boxH = 180
  const masterX = 30
  const slaveX = w - 30 - boxW
  const boxY = 30

  // Line spec: pin label on each side + direction
  // y positions inside the box
  const lines = [
    { y: boxY + 30, label: "SS",   masterPin: "D10", slavePin: "SS",   dir: "m2s", color: "#f59e0b" },
    { y: boxY + 70, label: "MOSI", masterPin: "D11", slavePin: "MOSI", dir: "m2s", color: "#60a5fa" },
    { y: boxY + 110, label: "MISO", masterPin: "D12", slavePin: "MISO", dir: "s2m", color: "#10b981" },
    { y: boxY + 150, label: "SCK",  masterPin: "D13", slavePin: "SCK",  dir: "m2s", color: "#a78bfa" },
  ] as const

  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Master box */}
        <rect
          x={masterX}
          y={boxY}
          width={boxW}
          height={boxH}
          rx={4}
          fill="#0f0f0f"
          stroke="#d1d5db"
          strokeWidth={1.4}
        />
        <text
          x={masterX + boxW / 2}
          y={boxY + 16}
          textAnchor="middle"
          fontSize={11}
          fill="#d1d5db"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontWeight={600}
        >
          Uno (master)
        </text>

        {/* Slave box */}
        <rect
          x={slaveX}
          y={boxY}
          width={boxW}
          height={boxH}
          rx={4}
          fill="#0f0f0f"
          stroke="#d1d5db"
          strokeWidth={1.4}
        />
        <text
          x={slaveX + boxW / 2}
          y={boxY + 16}
          textAnchor="middle"
          fontSize={11}
          fill="#d1d5db"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontWeight={600}
        >
          Peripheral (slave)
        </text>

        {/* Lines */}
        {lines.map((ln) => {
          const x1 = masterX + boxW
          const x2 = slaveX
          const midX = (x1 + x2) / 2
          return (
            <g key={ln.label}>
              {/* Master pin label */}
              <text
                x={masterX + boxW - 6}
                y={ln.y + 4}
                textAnchor="end"
                fontSize={10}
                fill="#9ca3af"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {ln.masterPin}
              </text>

              {/* Slave pin label */}
              <text
                x={slaveX + 6}
                y={ln.y + 4}
                textAnchor="start"
                fontSize={10}
                fill="#9ca3af"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {ln.slavePin}
              </text>

              {/* The line itself */}
              <line
                x1={x1}
                y1={ln.y}
                x2={x2}
                y2={ln.y}
                stroke={ln.color}
                strokeWidth={2}
              />

              {/* Direction arrow */}
              {ln.dir === "m2s" ? (
                <polyline
                  points={`${midX + 20},${ln.y - 4} ${midX + 26},${ln.y} ${midX + 20},${ln.y + 4}`}
                  fill="none"
                  stroke={ln.color}
                  strokeWidth={1.6}
                />
              ) : (
                <polyline
                  points={`${midX - 20},${ln.y - 4} ${midX - 26},${ln.y} ${midX - 20},${ln.y + 4}`}
                  fill="none"
                  stroke={ln.color}
                  strokeWidth={1.6}
                />
              )}

              {/* Line label */}
              <text
                x={midX}
                y={ln.y - 6}
                textAnchor="middle"
                fontSize={10}
                fill={ln.color}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight={600}
              >
                {ln.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

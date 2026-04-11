// Arduino Uno Reference > Under the hood > Clock, crystal, power regulation

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

export function ClockPowerPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "clock-power",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Clock, crystal, power regulation"
        subtitle="The 16 MHz crystal keeps time; the onboard regulators make the rails the ATmega needs."
      />

      <Section title="The crystal">
        <p className="text-sm leading-relaxed">
          Next to the ATmega328P, the small silver can labelled
          "16.000" is a quartz crystal resonator. It's the timebase
          for the entire board — every{" "}
          <code>millis()</code> reading, every PWM period, every
          baud-rate clock ultimately counts ticks of this crystal.
          16 MHz gives the chip ~16 million instructions per second,
          or roughly 62.5 ns per instruction.
        </p>

        <Figure caption="The board's power and clock distribution: USB 5 V feeds the rail directly; VIN passes through the 5 V regulator; the 3.3 V regulator hangs off the 5 V rail; the crystal clocks the ATmega.">
          <PowerClockDiagram />
        </Figure>
      </Section>

      <Section title="The two regulators">
        <p className="text-sm leading-relaxed">
          The Uno has two <Term k="voltage-regulator" /> chips near
          the barrel jack. One turns whatever you feed into VIN or
          the barrel jack (7–12 V is the happy range) into a clean
          5 V rail. A second smaller regulator derives 3.3 V from
          that 5 V for the 3V3 pin. When the board is running on USB
          power instead, the USB 5 V bypasses the main regulator and
          feeds the 5 V rail directly.
        </p>

        <Table
          headers={["Source", "5 V rail", "3.3 V rail"]}
          rows={[
            ["USB", "From USB directly", "From 3.3 V regulator"],
            ["VIN / barrel jack", "From main regulator", "From 3.3 V regulator"],
          ]}
        />
      </Section>

      <Section title="Why it matters">
        <p className="text-sm leading-relaxed">
          The 3.3 V regulator on the Uno can only supply about 50 mA
          — fine for a small sensor, not fine for a whole ESP
          module. And the linear 5 V regulator drops the extra
          voltage as heat; powering the Uno from 12 V means the
          regulator has to burn 7 V × (whatever current), which gets
          warm fast. For high-current projects, feed 5 V straight
          into the 5 V pin from an external supply and bypass the
          regulator entirely.
        </p>

        <Note>
          "Feed 5 V into the 5 V pin" only works if your supply is
          actually 5 V and clean. 5.5 V can damage the chip; 4.5 V
          can cause brownouts.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/voltage-regulators",
          "board/power-pins",
          "board/powering",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Power + clock distribution diagram ─────────────────────────────────

function PowerClockDiagram() {
  const w = 600
  const h = 280

  const Box = ({
    x,
    y,
    bw,
    bh,
    label,
    sub,
    color,
  }: {
    x: number
    y: number
    bw: number
    bh: number
    label: string
    sub?: string
    color: string
  }) => (
    <g>
      <rect
        x={x}
        y={y}
        width={bw}
        height={bh}
        rx={4}
        fill="#0f0f0f"
        stroke={color}
        strokeWidth={1.4}
      />
      <text
        x={x + bw / 2}
        y={y + bh / 2 + (sub ? -4 : 4)}
        textAnchor="middle"
        fontSize={12}
        fill={color}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={600}
      >
        {label}
      </text>
      {sub && (
        <text
          x={x + bw / 2}
          y={y + bh / 2 + 12}
          textAnchor="middle"
          fontSize={9}
          fill="#9ca3af"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {sub}
        </text>
      )}
    </g>
  )

  const Arrow = ({
    x1,
    y1,
    x2,
    y2,
    color,
    label,
  }: {
    x1: number
    y1: number
    x2: number
    y2: number
    color: string
    label?: string
  }) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} />
      <polyline
        points={`${x2 - 6},${y2 - 4} ${x2},${y2} ${x2 - 6},${y2 + 4}`}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
      />
      {label && (
        <text
          x={(x1 + x2) / 2}
          y={y1 - 6}
          textAnchor="middle"
          fontSize={9}
          fill="#9ca3af"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {label}
        </text>
      )}
    </g>
  )

  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* USB input */}
        <Box x={20} y={30} bw={110} bh={50} label="USB 5 V" sub="Type-B port" color="#60a5fa" />
        {/* VIN input */}
        <Box x={20} y={140} bw={110} bh={50} label="VIN / barrel" sub="7–12 V" color="#a78bfa" />

        {/* 5V regulator */}
        <Box x={180} y={140} bw={130} bh={50} label="5 V regulator" sub="LM1117" color="#10b981" />

        {/* 5 V rail */}
        <Box x={340} y={80} bw={100} bh={50} label="5 V rail" color="#ef4444" />

        {/* 3.3 V regulator */}
        <Box x={340} y={160} bw={100} bh={50} label="3 V3 reg" sub="≤50 mA" color="#10b981" />

        {/* 3.3 V rail */}
        <Box x={470} y={160} bw={110} bh={50} label="3.3 V rail" color="#f59e0b" />

        {/* ATmega */}
        <Box x={470} y={30} bw={110} bh={70} label="ATmega328P" sub="VCC + CLKIN" color="#d1d5db" />

        {/* Crystal */}
        <Box x={340} y={220} bw={100} bh={40} label="16 MHz XTAL" color="#6b7280" />

        {/* Arrows */}
        {/* USB → 5V rail (bypasses regulator) */}
        <Arrow x1={130} y1={55} x2={340} y2={100} color="#60a5fa" label="bypasses regulator" />
        {/* VIN → regulator */}
        <Arrow x1={130} y1={165} x2={180} y2={165} color="#a78bfa" />
        {/* Regulator → 5V rail */}
        <Arrow x1={310} y1={160} x2={390} y2={130} color="#10b981" />
        {/* 5V rail → 3V3 reg */}
        <Arrow x1={390} y1={130} x2={390} y2={160} color="#10b981" />
        {/* 3V3 reg → 3.3V rail */}
        <Arrow x1={440} y1={185} x2={470} y2={185} color="#f59e0b" />
        {/* 5V rail → ATmega VCC */}
        <Arrow x1={440} y1={100} x2={470} y2={65} color="#ef4444" />
        {/* Crystal → ATmega CLKIN */}
        <Arrow x1={440} y1={240} x2={525} y2={100} color="#6b7280" label="16 MHz clock" />
      </svg>
    </div>
  )
}

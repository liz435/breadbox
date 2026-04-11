// Electronics Fundamentals > Core concepts > Power and current limits

import {
  LearnLayout,
  PageTitle,
  Section,
  Warn,
  Note,
  Table,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function PowerPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "power",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Power and current limits"
        subtitle="Why components heat up, and why Arduino pins have a cap."
      />

      <Section title="The equation">
        <p className="text-sm leading-relaxed">
          Electrical power is what turns into heat (or light, or motion)
          when current flows through a component. It's measured in watts
          and follows a one-line formula:
        </p>

        <p className="my-3 text-center text-lg font-mono text-gray-100">
          P = V × I
        </p>

        <p className="text-sm leading-relaxed">
          Power equals voltage multiplied by current. A 5 V supply
          pushing 20 mA through a resistor delivers 5 × 0.020 = 0.1 W
          to that resistor. All of that becomes heat.
        </p>

        <Figure caption="A resistor on a 5 V rail. Whatever V × I works out to leaves the resistor as heat.">
          <Schematic cols={10} rows={6}>
            <Schematic.Vcc at={[3, 1]} label="+5V" />
            <Schematic.Wire points={[[3, 1], [3, 2]]} />
            <Schematic.Resistor from={[3, 2]} to={[3, 4]} label="P = V × I" />
            <Schematic.Wire points={[[3, 4], [3, 5]]} />
            <Schematic.Ground at={[3, 5]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="Why components heat up">
        <p className="text-sm leading-relaxed">
          Any component that resists current flow turns the electrical
          energy it opposes into heat. A resistor does this on purpose.
          A wire does it accidentally (but a tiny amount, because its
          resistance is nearly zero). A motor does it when stalled.
          Enough heat and things melt, smoke, or catch fire — which is
          why each component has a power rating.
        </p>
      </Section>

      <Section title="Resistor power ratings">
        <p className="text-sm leading-relaxed">
          The small axial resistors in an Arduino kit are typically
          rated for <strong className="text-gray-200">¼ watt</strong>.
          That's plenty for low-voltage hobby work — even a 5 V supply
          through a 100 Ω resistor only dissipates 0.25 W, right at the
          limit. Keep well under the rating for safety.
        </p>

        <Table
          headers={["Resistor size", "Power rating"]}
          rows={[
            ["1/8 W (small)", "0.125 W"],
            ["1/4 W (standard kit)", "0.25 W"],
            ["1/2 W", "0.5 W"],
            ["1 W", "1 W"],
          ]}
        />
      </Section>

      <Section title="Arduino pin current limits">
        <p className="text-sm leading-relaxed">
          An Arduino Uno pin is not an unlimited power source. Each
          individual digital pin can handle:
        </p>

        <Table
          headers={["Limit", "Value"]}
          rows={[
            ["Safe continuous current per pin", "20 mA"],
            ["Absolute max current per pin", "40 mA"],
            ["Max combined current across all pins", "200 mA"],
            ["Max current from 5V pin", "~500 mA (USB powered)"],
            ["Max current from 3V3 pin", "50 mA"],
          ]}
        />

        <Warn>
          Drawing more than 40 mA from a pin can permanently damage the
          ATmega328P. If you need to drive a motor, a coil, or a bright
          LED chain, use a transistor — the pin drives the transistor,
          the transistor drives the load from a bigger supply.
        </Warn>

        <Note>
          The "20 mA safe, 40 mA absolute" rule is why nearly every LED
          circuit lands on a resistor that produces roughly 15 mA — it's
          well inside the safe range and leaves margin for component
          variation.
        </Note>

        <Figure caption="Current budget for a USB-powered Uno. Total draw must stay below ~500 mA.">
          <CurrentBudgetChart />
        </Figure>
      </Section>

      <SeeAlso
        refs={[
          "board/power-pins",
          "board/powering",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Current budget bar chart ───────────────────────────────────────────

function CurrentBudgetChart() {
  const w = 440
  const h = 180
  const rows = [
    { label: "Per pin (safe)", value: 20, max: 500, color: "#60a5fa" },
    { label: "Per pin (max)", value: 40, max: 500, color: "#a78bfa" },
    { label: "Per port group", value: 100, max: 500, color: "#10b981" },
    { label: "Whole chip", value: 200, max: 500, color: "#f59e0b" },
    { label: "USB total", value: 500, max: 500, color: "#ef4444" },
  ]
  const labelW = 128
  const barW = w - labelW - 70
  const rowH = 24
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />
        {rows.map((row, i) => {
          const y = 14 + i * (rowH + 6)
          const filled = (row.value / row.max) * barW
          return (
            <g key={row.label}>
              <text
                x={labelW - 6}
                y={y + rowH / 2 + 4}
                textAnchor="end"
                fontSize={10}
                fill="#d1d5db"
                fontFamily="ui-monospace, Menlo, monospace"
              >
                {row.label}
              </text>
              <rect x={labelW} y={y} width={barW} height={rowH} fill="#1f2937" stroke="#374151" strokeWidth={1} />
              <rect x={labelW} y={y} width={filled} height={rowH} fill={row.color} fillOpacity={0.8} />
              <text
                x={labelW + barW + 6}
                y={y + rowH / 2 + 4}
                fontSize={10}
                fill="#9ca3af"
                fontFamily="ui-monospace, Menlo, monospace"
              >
                {row.value} mA
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

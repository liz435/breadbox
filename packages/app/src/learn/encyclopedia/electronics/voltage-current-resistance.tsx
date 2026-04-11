// Electronics Fundamentals > Core concepts > Voltage, current, resistance

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

export function VoltageCurrentResistancePage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "voltage-current-resistance",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Voltage, current, resistance"
        subtitle="The three quantities every beginner has to internalize, in plain language."
      />

      <Section title="The water analogy">
        <p className="text-sm leading-relaxed">
          Every electronics tutorial reaches for the same metaphor
          because it works. Picture electricity as water in a pipe:
        </p>

        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">Voltage</strong> is the
            water pressure — how hard the water is pushing on the pipe
            walls. Higher voltage, harder push.
          </li>
          <li>
            <strong className="text-gray-200">Current</strong> is how
            much water is flowing past a point per second — the actual
            volume moving through the pipe.
          </li>
          <li>
            <strong className="text-gray-200">Resistance</strong> is how
            narrow the pipe is. A pinched pipe lets less water through
            even if the pressure stays the same.
          </li>
        </ul>

        <Note>
          Voltage pushes, current flows, resistance restricts. Keep
          those three verbs in your head and every circuit diagram gets
          easier to read.
        </Note>

        <Figure caption="Water-flow analogy — pressure pushes, flow rate measures, and a narrowing resists.">
          <WaterAnalogyDiagram />
        </Figure>
      </Section>

      <Section title="Units and symbols">
        <Table
          headers={["Quantity", "Unit", "Symbol", "What it measures"]}
          rows={[
            ["Voltage", "Volt (V)", "V", "Electrical pressure between two points"],
            ["Current", "Amp (A)", "I", "Rate of electric charge flow"],
            ["Resistance", "Ohm (Ω)", "R", "Opposition to current flow"],
          ]}
        />

        <p className="text-sm leading-relaxed">
          Hobby electronics rarely deal with a full amp. The common
          prefixes are milli- (1/1000) for current and kilo- (1000×) for
          resistance. A typical LED draws ~20 mA through a ~220 Ω
          resistor.
        </p>
      </Section>

      <Section title="Intuition before math">
        <p className="text-sm leading-relaxed">
          You do not need to memorize formulas to start. What matters
          first is the mental picture: if you raise the voltage, you
          push more current through the same resistor. If you raise the
          resistance, less current flows at the same voltage. These two
          facts are what the math on the next page captures.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "electronics/ohms-law",
          "electronics/power",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Water-flow analogy diagram ─────────────────────────────────────────

function WaterAnalogyDiagram() {
  const w = 460
  const h = 180
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
        {/* Pressure gauge (voltage) */}
        <circle cx={60} cy={90} r={26} fill="#0f0f0f" stroke="#9ca3af" strokeWidth={1.6} />
        <line x1={60} y1={90} x2={76} y2={74} stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" />
        <circle cx={60} cy={90} r={2} fill="#f59e0b" />
        <text x={60} y={132} textAnchor="middle" fontSize={11} fill="#f59e0b" fontFamily="ui-monospace, Menlo, monospace">Voltage</text>
        <text x={60} y={146} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">(pressure)</text>
        {/* Pipe body */}
        <path
          d="M 90 70 L 200 70 L 220 82 L 300 82 L 320 70 L 430 70 L 430 110 L 320 110 L 300 98 L 220 98 L 200 110 L 90 110 Z"
          fill="#1f2937"
          stroke="#9ca3af"
          strokeWidth={1.6}
        />
        {/* Narrowing highlight (resistance) */}
        <rect x={220} y={82} width={80} height={16} fill="#a78bfa" fillOpacity={0.18} />
        <text x={260} y={60} textAnchor="middle" fontSize={11} fill="#a78bfa" fontFamily="ui-monospace, Menlo, monospace">Resistance</text>
        <text x={260} y={140} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">(narrow pipe)</text>
        {/* Flow arrows (current) */}
        {[110, 160, 355, 405].map((x, i) => (
          <g key={i}>
            <line x1={x} y1={90} x2={x + 22} y2={90} stroke="#60a5fa" strokeWidth={2} strokeLinecap="round" />
            <polyline points={`${x + 18},${86} ${x + 22},${90} ${x + 18},${94}`} fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
        <text x={140} y={40} textAnchor="middle" fontSize={11} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">Current (flow)</text>
      </svg>
    </div>
  )
}

// Electronics Fundamentals > Components > Voltage regulators

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

export function VoltageRegulatorsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "voltage-regulators",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Voltage regulators"
        subtitle="A chip that turns an unstable input voltage into a fixed, clean output."
      />

      <Section title="The job">
        <p className="text-sm leading-relaxed">
          A <Term k="voltage-regulator" /> takes whatever voltage
          you feed it (within its allowed input range) and
          produces a stable output at a fixed level. If your
          battery drifts from 9 V down to 7 V as it drains, the
          regulator still hands your logic circuit a rock-solid
          5 V. Without one, every chip on the board would have to
          tolerate the full range of the supply, which mostly
          they can't.
        </p>
      </Section>

      <Section title="Linear vs switching">
        <p className="text-sm leading-relaxed">
          There are two architectures in common use on a hobby
          bench. A <em className="text-foreground">linear</em>{" "}
          regulator is the simple one: it behaves like a smart
          variable resistor that burns the extra voltage as heat.
          The 7805 (5 V) and the LM1117 (adjustable or fixed
          3.3 V / 5 V) are the classics. Linear regulators are
          cheap and quiet but inefficient — if the input is 12 V
          and the output is 5 V at 1 A, the regulator is
          dissipating 7 W as heat.
        </p>

        <p className="text-sm leading-relaxed">
          A <em className="text-foreground">switching</em>{" "}
          regulator — often a <em>buck converter</em> for
          step-down duty — chops the input on and off at high
          frequency and filters the result with an inductor and
          capacitor. It's much more efficient (85–95%) but
          introduces a bit of electrical noise and costs more.
          The tiny "MP1584" or "LM2596" modules sold on
          hobbyist sites are switching regulators.
        </p>

        <Table
          headers={["Type", "Efficiency", "Noise", "Typical parts"]}
          rows={[
            ["Linear", "Low", "Very low", "7805, LM1117, AMS1117"],
            ["Switching (buck)", "High", "Moderate", "LM2596, MP1584, MP2307"],
          ]}
        />

        <Figure caption="A 7805 at its simplest: unregulated input, ground, 5 V output, plus one cap on each side.">
          <RegulatorBlock />
        </Figure>
      </Section>

      <Section title="On the Uno">
        <p className="text-sm leading-relaxed">
          The Uno itself carries two linear regulators. The main
          one turns VIN (barrel jack, 7–12 V) into a 5 V rail.
          A smaller regulator derives 3.3 V from that 5 V for
          the 3V3 pin. Both are linear, which is why powering
          the Uno from 12 V makes the main regulator noticeably
          warm under load. For high-current projects, supply 5 V
          directly to the 5 V pin from an external switching
          regulator and bypass the onboard linear one entirely.
        </p>

        <Note>
          Every linear regulator wants a small capacitor on its
          input and another on its output — check the datasheet.
          The 7805 is famously "three legs and two caps" to the
          point where people forget the caps are load-bearing.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/clock-power",
          "board/power-pins",
          "electronics/decoupling",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── 7805 regulator block diagram ───────────────────────────────────────

function RegulatorBlock() {
  const w = 480
  const h = 220
  const boxX = 170
  const boxY = 70
  const boxW = 140
  const boxH = 80
  const midY = boxY + boxH / 2
  const groundY = boxY + boxH + 30
  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />
        {/* Regulator box */}
        <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={4} fill="#1f2937" stroke="#a78bfa" strokeWidth={1.6} />
        <text x={boxX + boxW / 2} y={boxY + 30} textAnchor="middle" fontSize={14} fill="#a78bfa" fontFamily="ui-monospace, Menlo, monospace">7805</text>
        <text x={boxX + boxW / 2} y={boxY + 48} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">linear reg</text>

        {/* IN pin */}
        <line x1={boxX - 70} y1={midY} x2={boxX} y2={midY} stroke="#f59e0b" strokeWidth={1.6} />
        <text x={boxX + 6} y={midY + 4} fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">IN</text>
        <text x={boxX - 70} y={midY - 10} fontSize={11} fill="#f59e0b" fontFamily="ui-monospace, Menlo, monospace">9 V in</text>

        {/* OUT pin */}
        <line x1={boxX + boxW} y1={midY} x2={boxX + boxW + 70} y2={midY} stroke="#10b981" strokeWidth={1.6} />
        <text x={boxX + boxW - 24} y={midY + 4} fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">OUT</text>
        <text x={boxX + boxW + 16} y={midY - 10} fontSize={11} fill="#10b981" fontFamily="ui-monospace, Menlo, monospace">5 V out</text>

        {/* GND pin */}
        <line x1={boxX + boxW / 2} y1={boxY + boxH} x2={boxX + boxW / 2} y2={groundY} stroke="#9ca3af" strokeWidth={1.4} />
        <text x={boxX + boxW / 2 - 20} y={boxY + boxH + 12} fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">GND</text>
        {/* Ground symbol */}
        <g transform={`translate(${boxX + boxW / 2}, ${groundY})`}>
          <line x1={-10} y1={0} x2={10} y2={0} stroke="#9ca3af" strokeWidth={2} />
          <line x1={-6} y1={4} x2={6} y2={4} stroke="#9ca3af" strokeWidth={1.6} />
          <line x1={-3} y1={8} x2={3} y2={8} stroke="#9ca3af" strokeWidth={1.2} />
        </g>

        {/* Input cap */}
        <g transform={`translate(${boxX - 40}, ${midY})`}>
          <line x1={0} y1={0} x2={0} y2={36} stroke="#9ca3af" strokeWidth={1.4} />
          <line x1={-10} y1={36} x2={10} y2={36} stroke="#9ca3af" strokeWidth={2} />
          <line x1={-10} y1={42} x2={10} y2={42} stroke="#9ca3af" strokeWidth={2} />
          <line x1={0} y1={42} x2={0} y2={78} stroke="#9ca3af" strokeWidth={1.4} />
          <line x1={-12} y1={78} x2={12} y2={78} stroke="#9ca3af" strokeWidth={1.4} />
          <text x={14} y={42} fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">Cin</text>
        </g>

        {/* Output cap */}
        <g transform={`translate(${boxX + boxW + 40}, ${midY})`}>
          <line x1={0} y1={0} x2={0} y2={36} stroke="#9ca3af" strokeWidth={1.4} />
          <line x1={-10} y1={36} x2={10} y2={36} stroke="#9ca3af" strokeWidth={2} />
          <line x1={-10} y1={42} x2={10} y2={42} stroke="#9ca3af" strokeWidth={2} />
          <line x1={0} y1={42} x2={0} y2={78} stroke="#9ca3af" strokeWidth={1.4} />
          <line x1={-12} y1={78} x2={12} y2={78} stroke="#9ca3af" strokeWidth={1.4} />
          <text x={14} y={42} fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">Cout</text>
        </g>
      </svg>
    </div>
  )
}

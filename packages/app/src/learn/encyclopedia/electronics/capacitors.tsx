// Electronics Fundamentals > Components > Capacitors

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function CapacitorsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "capacitors",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Capacitors"
        subtitle="Two plates, a gap, and a reservoir of charge — the component that smooths noisy power rails."
      />

      <Section title="What a capacitor does">
        <p className="text-sm leading-relaxed">
          A <Term k="capacitor" /> stores electric charge on two
          conducting plates separated by an insulator. Apply a
          voltage and current flows briefly as the plates charge up;
          once charged, the capacitor holds that voltage and passes
          no more DC current. Think of it as a tiny rechargeable
          battery with near-zero capacity but very fast reflexes.
        </p>

        <Figure caption="Charging curve: the cap voltage rises exponentially toward the supply, never quite reaching it.">
          <ChargeCurve />
        </Figure>
      </Section>

      <Section title="Units you'll see">
        <Table
          headers={["Prefix", "Value", "Typical use"]}
          rows={[
            ["pF (picofarad)", "10⁻¹² F", "RF, crystal load caps"],
            ["nF (nanofarad)", "10⁻⁹ F", "Filter, debounce"],
            ["µF (microfarad)", "10⁻⁶ F", "Decoupling, bulk filtering"],
            ["mF (millifarad)", "10⁻³ F", "Power supplies, large reservoirs"],
            ["F (farad)", "1 F", "Supercapacitors, memory backup"],
          ]}
        />
      </Section>

      <Section title="Polarized vs non-polarized">
        <p className="text-sm leading-relaxed">
          Ceramic capacitors (usually nF and small µF values) are
          non-polarized — orient them any way you like. Electrolytic
          capacitors (the cylindrical ones, typically ≥1 µF) are{" "}
          <em className="text-gray-200">polarized</em>: the longer
          lead is positive, and the can has a stripe marking the
          negative lead. Reverse them and they can fail dramatically.
        </p>

        <Warn>
          Back-powering a large electrolytic capacitor can make it
          swell, leak, or pop. When in doubt, double-check the
          stripe is on the ground side before you apply power.
        </Warn>
      </Section>

      <Section title="The decoupling cap">
        <p className="text-sm leading-relaxed">
          The single most common Arduino-world capacitor use is{" "}
          <em className="text-gray-200">decoupling</em>: one{" "}
          <code className="text-gray-200">0.1 µF</code> ceramic cap
          between VCC and GND, placed physically close to every IC.
          It acts as a tiny local reservoir that absorbs the fast
          current spikes a chip draws when its outputs switch,
          keeping those spikes from polluting the shared power rail.
          "0.1 µF near every chip" is a rule you should internalize.
        </p>

        <Figure caption="0.1 µF ceramic tied between a chip's Vcc and GND pins, sitting right at the part.">
          <Schematic cols={12} rows={6}>
            <Schematic.Vcc at={[3, 1]} label="+5V" />
            <Schematic.Wire points={[[3, 1], [3, 2]]} />
            <Schematic.Junction at={[3, 2]} />
            <Schematic.Wire points={[[3, 2], [7, 2]]} />
            <Schematic.Label at={[9, 2]} text="IC Vcc" anchor="start" />
            <Schematic.Capacitor from={[3, 2]} to={[3, 4]} label="0.1µF" />
            <Schematic.Wire points={[[3, 4], [3, 5]]} />
            <Schematic.Junction at={[3, 4]} />
            <Schematic.Wire points={[[3, 4], [7, 4]]} />
            <Schematic.Label at={[9, 4]} text="IC GND" anchor="start" />
            <Schematic.Ground at={[3, 5]} />
          </Schematic>
        </Figure>

        <Note>
          Breadbox models capacitors as{" "}
          <em className="text-gray-200">visual-only</em>: they show
          up in the schematic and your netlist parses them, but the
          simulator doesn't run transient analysis, so they have no
          runtime behavior. Their job in a Breadbox sketch is
          documentation — when you build the circuit for real, put
          them in.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/resistors",
          "electronics/power",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── RC charging curve diagram ──────────────────────────────────────────

function ChargeCurve() {
  const w = 420
  const h = 180
  const originX = 50
  const originY = 150
  const plotW = 340
  const plotH = 110
  // V(t) = Vmax * (1 - e^(-t/RC))
  const pts: [number, number][] = []
  const steps = 80
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const v = 1 - Math.exp(-5 * t)
    pts.push([originX + t * plotW, originY - v * plotH])
  }
  const pathD = pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0]} ${pt[1]}`).join(" ")
  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />
        {/* Axes */}
        <line x1={originX} y1={originY} x2={originX + plotW} y2={originY} stroke="#6b7280" strokeWidth={1.2} />
        <line x1={originX} y1={originY} x2={originX} y2={originY - plotH - 10} stroke="#6b7280" strokeWidth={1.2} />
        {/* Supply rail */}
        <line
          x1={originX}
          y1={originY - plotH}
          x2={originX + plotW}
          y2={originY - plotH}
          stroke="#ef4444"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text x={originX + plotW + 4} y={originY - plotH + 4} fontSize={10} fill="#ef4444" fontFamily="ui-monospace, Menlo, monospace">Vcc</text>
        {/* Curve */}
        <path d={pathD} fill="none" stroke="#60a5fa" strokeWidth={2.2} />
        {/* Labels */}
        <text x={originX - 8} y={originY - plotH + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">V</text>
        <text x={originX + plotW} y={originY + 14} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">time</text>
        <text x={originX - 8} y={originY + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">0</text>
        <text x={w / 2} y={22} textAnchor="middle" fontSize={11} fill="#d1d5db" fontFamily="ui-monospace, Menlo, monospace">
          Capacitor charging through a resistor
        </text>
      </svg>
    </div>
  )
}

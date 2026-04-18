// Electronics Fundamentals > Signals > Voltage dividers

import { useState, useId } from "react"
import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function VoltageDividersPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "voltage-dividers",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Voltage dividers"
        subtitle="Two resistors in series tap a fraction of the supply — the second most useful circuit in the kit."
      />

      <Section title="The formula">
        <p className="text-sm leading-relaxed">
          Put two resistors in series between a voltage source and
          ground, and the voltage at the midpoint is a fraction of
          the supply, set by the ratio of the two resistors:
        </p>

        <p className="my-3 text-center text-lg font-mono text-gray-100">
          V<sub>out</sub> = V<sub>in</sub> × R2 / (R1 + R2)
        </p>

        <p className="text-sm leading-relaxed">
          R1 is the top resistor (between V<sub>in</sub> and the
          midpoint); R2 is the bottom resistor (between the midpoint
          and ground). Bigger R2 relative to R1 means a higher
          output.
        </p>

        <Figure caption="Two resistors in series between 5 V and GND. Vout is the midpoint.">
          <Schematic cols={10} rows={8} title="Voltage divider: Vin through R1 and R2 in series to GND, Vout at midpoint">
            <Schematic.Vcc at={[3, 1]} label="+5V" />
            <Schematic.Wire points={[[3, 1], [3, 2]]} />
            <Schematic.Resistor from={[3, 2]} to={[3, 4]} label="R1" />
            <Schematic.Junction at={[3, 4]} />
            <Schematic.Wire points={[[3, 4], [6, 4]]} />
            <Schematic.Label at={[7, 4]} text="Vout" anchor="start" />
            <Schematic.Resistor from={[3, 4]} to={[3, 6]} label="R2" />
            <Schematic.Ground at={[3, 6]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="Interactive explorer">
        <p className="text-sm leading-relaxed mb-4">
          Adjust R1, R2, and V<sub>in</sub> to see how V<sub>out</sub> changes.
          The bar shows the output fraction of the supply.
        </p>
        <VoltageDividerExplorer />
      </Section>

      <Section title="Worked example">
        <p className="text-sm leading-relaxed">
          A sensor outputs 0–9 V, but the Arduino ADC maxes out at
          5 V. Pick R1 = 4.7 kΩ and R2 = 4.7 kΩ:
        </p>

        <p className="mt-2 text-sm leading-relaxed font-mono text-gray-200">
          Vout = 9 V × 4.7k / (4.7k + 4.7k) = 4.5 V
        </p>

        <p className="text-sm leading-relaxed">
          The full 9 V input lands at 4.5 V at the pin — safely
          under 5 V, with headroom. Scale R2 up or down to change
          the ratio.
        </p>
      </Section>

      <Section title="Where it shows up">
        <p className="text-sm leading-relaxed">
          Potentiometers{" "}
          <em className="text-gray-200">are</em> voltage dividers —
          the wiper walks the midpoint continuously between the two
          ends. Photoresistors, thermistors, and flex sensors all
          use a fixed resistor paired with the variable one to
          produce a voltage the Arduino can measure.
        </p>

        <Note>
          The divider feeds whatever's next through its own
          resistance (the two Rs in parallel). Keep the resistors
          small compared to the input impedance of the thing you're
          driving — for the ADC, that means staying under about 10
          kΩ total.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/potentiometers",
          "electronics/ohms-law",
          "board/analog-pins",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Interactive voltage divider explorer ──────────────────────────────────

function VoltageDividerExplorer() {
  const [vin, setVin] = useState(5)
  const [r1, setR1] = useState(10)     // kΩ
  const [r2, setR2] = useState(10)     // kΩ

  const vinId = useId()
  const r1Id = useId()
  const r2Id = useId()

  const vout = vin * r2 / (r1 + r2)
  const pct = (vout / vin) * 100

  return (
    <div className="rounded-md border border-neutral-800 bg-[#0d0d0d] p-4 space-y-4">
      {/* Sliders */}
      <div className="space-y-4">
        <SliderRow
          id={vinId}
          label="Vin"
          value={vin}
          min={1} max={24} step={0.5}
          display={`${vin.toFixed(1)} V`}
          onChange={setVin}
        />
        <SliderRow
          id={r1Id}
          label="R1"
          value={r1}
          min={1} max={100} step={1}
          display={`${r1} kΩ`}
          onChange={setR1}
        />
        <SliderRow
          id={r2Id}
          label="R2"
          value={r2}
          min={1} max={100} step={1}
          display={`${r2} kΩ`}
          onChange={setR2}
        />
      </div>

      {/* Result */}
      <div className="rounded border border-neutral-700 bg-neutral-900 p-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-neutral-400">V<sub>out</sub></span>
          <span className="font-mono text-lg font-semibold text-emerald-400">
            {vout.toFixed(2)} V
          </span>
        </div>
        {/* Fraction bar */}
        <div className="relative h-3 rounded-full bg-neutral-800 overflow-hidden" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
          <span>0 V</span>
          <span className="text-neutral-400">{pct.toFixed(0)}% of Vin</span>
          <span>{vin.toFixed(1)} V</span>
        </div>
      </div>

      <p className="text-[11px] text-neutral-500">
        Formula: V<sub>out</sub> = {vin.toFixed(1)} × {r2}/{r1 + r2} = {vout.toFixed(2)} V
      </p>
    </div>
  )
}

type SliderRowProps = {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}

function SliderRow({ id, label, value, min, max, step, display, onChange }: SliderRowProps) {
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="font-mono text-sm text-gray-300 w-6">{label}</label>
        <span className="font-mono text-sm text-gray-300 tabular-nums min-w-[70px] text-right">{display}</span>
      </div>
      <div className="relative h-2 rounded-full bg-neutral-800">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-blue-500/60"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-valuetext={display}
        />
      </div>
    </div>
  )
}

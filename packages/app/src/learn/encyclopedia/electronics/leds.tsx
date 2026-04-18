// Electronics Fundamentals > Components > LEDs

import { useState } from "react"
import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"
import { cn } from "@/utils/classnames"

export function LedsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "leds",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="LEDs"
        subtitle="Light-Emitting Diodes — the first component you'll ever wire to an Arduino."
      />

      <Section title="What an LED is">
        <p className="text-sm leading-relaxed">
          An <Term k="led">LED</Term> is a diode that emits light when
          current flows through it in the forward direction. Like all
          diodes, it only conducts one way, and it drops a nearly fixed
          voltage called the <Term k="forward-voltage">forward
          voltage</Term> (Vf) once current starts to flow.
        </p>

        <LedColorTable />
      </Section>

      <Section title="Polarity">
        <p className="text-sm leading-relaxed">
          LEDs are polarized — the <strong className="text-gray-200">anode</strong>{" "}
          (positive) and <strong className="text-gray-200">cathode</strong>{" "}
          (negative) legs are not interchangeable. On a through-hole
          LED you can tell them apart two ways:
        </p>

        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
          <li>The <strong className="text-gray-200">longer lead</strong> is the anode (+).</li>
          <li>The <strong className="text-gray-200">flat edge</strong> on the plastic rim marks the cathode (−).</li>
        </ul>

        <Note>
          Plug an LED in backwards and nothing happens — no current
          flows. It won't damage the LED for a normal 5 V supply, but
          it won't light up either. Flip it and try again.
        </Note>
      </Section>

      <Section title="Why they need a resistor">
        <p className="text-sm leading-relaxed">
          An LED's current vs. voltage curve is almost vertical once you
          pass the forward voltage. A tiny change in voltage means a
          huge change in current. Connect an LED directly to 5 V and
          the current will spike past the LED's limit — it burns out
          in a flash or two.
        </p>

        <p className="text-sm leading-relaxed mt-2">
          The fix is a series <Term k="resistor">resistor</Term> that
          absorbs the leftover voltage and fixes the current. For a red
          LED on 5 V drawing ~15 mA:
        </p>

        <p className="mt-2 text-sm leading-relaxed font-mono text-gray-200">
          R = (5 − 2) V / 0.015 A = 200 Ω
        </p>

        <Figure caption="LED with series current-limiting resistor.">
          <Schematic cols={12} rows={5} title="LED circuit: +5V through 220Ω resistor to LED anode, cathode to GND">
            <Schematic.Vcc at={[1, 2]} label="+5V" />
            <Schematic.Wire points={[[1, 2], [2, 2]]} />
            <Schematic.Resistor from={[2, 2]} to={[6, 2]} label="220Ω" />
            <Schematic.Wire points={[[6, 2], [7, 2]]} />
            <Schematic.Led from={[7, 2]} to={[9, 2]} label="anode → cathode" />
            <Schematic.Wire points={[[9, 2], [9, 4]]} />
            <Schematic.Ground at={[9, 4]} />
          </Schematic>
        </Figure>

        <Warn>
          Never wire an LED directly between 5 V and ground. The
          resistor is not optional — it's the only thing protecting the
          LED from burning out.
        </Warn>
      </Section>

      <SeeAlso
        refs={[
          "electronics/resistors",
          "electronics/ohms-law",
          "programming/digital-io",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Interactive LED color / Vf table ─────────────────────────────────────
//
// Clicking a row highlights it and shows the resistor calculation for
// that LED color on a 5 V Arduino pin at 15 mA.

type LedVariant = {
  color: string
  vf: number
  swatch: string
  typical: string
}

const LED_VARIANTS: LedVariant[] = [
  { color: "Red",    vf: 2.0, swatch: "#ef4444", typical: "10–20 mA" },
  { color: "Yellow", vf: 2.1, swatch: "#eab308", typical: "10–20 mA" },
  { color: "Green",  vf: 2.2, swatch: "#22c55e", typical: "10–20 mA" },
  { color: "Blue",   vf: 3.0, swatch: "#3b82f6", typical: "10–20 mA" },
  { color: "White",  vf: 3.2, swatch: "#f3f4f6", typical: "10–20 mA" },
  { color: "IR",     vf: 1.4, swatch: "#7c3aed", typical: "50–100 mA" },
]

function LedColorTable() {
  const [selected, setSelected] = useState<string>("Red")

  const active = LED_VARIANTS.find((v) => v.color === selected) ?? LED_VARIANTS[0]
  const vSupply = 5
  const iTarget = 0.015 // 15 mA
  const vDrop = vSupply - active.vf
  const rExact = vDrop / iTarget

  return (
    <div className="mt-3 rounded-md border border-neutral-800 overflow-hidden">
      <table className="w-full text-sm" role="table">
        <thead>
          <tr className="bg-neutral-900 text-left">
            <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 w-8" aria-label="Color swatch" />
            <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Color</th>
            <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Typical Vf</th>
            <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Typical current</th>
          </tr>
        </thead>
        <tbody>
          {LED_VARIANTS.map((v) => {
            const isActive = v.color === selected
            return (
              <tr
                key={v.color}
                className={cn(
                  "cursor-pointer border-t border-neutral-800 transition-colors",
                  isActive
                    ? "bg-neutral-700/40"
                    : "hover:bg-neutral-800/60",
                )}
                onClick={() => setSelected(v.color)}
                aria-selected={isActive}
                role="row"
              >
                <td className="px-3 py-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full ring-1 ring-neutral-700"
                    style={{ background: v.swatch }}
                    aria-hidden
                  />
                </td>
                <td className="px-3 py-2 text-gray-300 font-medium">{v.color}</td>
                <td className="px-3 py-2 font-mono text-gray-300">~{v.vf.toFixed(1)} V</td>
                <td className="px-3 py-2 font-mono text-gray-400">{v.typical}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Derived resistor calculation for selected row */}
      <div className="border-t border-neutral-700 bg-neutral-900 px-4 py-3">
        <p className="text-[11px] text-neutral-500 mb-1 uppercase tracking-wider font-semibold">
          Resistor for <span style={{ color: active.swatch }}>{active.color}</span> LED on 5 V at 15 mA
        </p>
        <p className="font-mono text-sm text-gray-300">
          R = (5 − {active.vf.toFixed(1)}) V / 0.015 A
          {" = "}
          <span className="text-emerald-400 font-semibold">{Math.round(rExact)} Ω</span>
          {" "}→ use{" "}
          <span className="text-emerald-300">{nearestStandard(rExact)} Ω</span>
        </p>
        <p className="text-[11px] text-neutral-500 mt-1">Click a row to recalculate for that LED color.</p>
      </div>
    </div>
  )
}

/** Snap to the nearest E12 series standard resistor value. */
function nearestStandard(r: number): number {
  const e12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82]
  const exp = Math.floor(Math.log10(r))
  const mantissa = r / Math.pow(10, exp)
  let best = e12[0]
  let bestDist = Infinity
  for (const v of e12) {
    const d = Math.abs(v - mantissa)
    if (d < bestDist) { bestDist = d; best = v }
  }
  return best * Math.pow(10, exp)
}

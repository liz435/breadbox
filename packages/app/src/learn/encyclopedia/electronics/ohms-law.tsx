// Electronics Fundamentals > Core concepts > Ohm's law

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
import { Term } from "../../term"
import { cn } from "@/utils/classnames"

export function OhmsLawPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "ohms-law",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Ohm's law"
        subtitle="V = I × R. The one equation you actually need."
      />

      <Section title="The equation">
        <p className="text-sm leading-relaxed">
          <Term k="ohms-law">Ohm's law</Term> says that across a{" "}
          <Term k="resistor">resistor</Term>, voltage equals current
          multiplied by resistance:
        </p>

        <p className="my-3 text-center text-lg font-mono text-gray-100">
          V = I × R
        </p>

        <p className="text-sm leading-relaxed">
          Rearranged, the same relationship gives you{" "}
          <code>I = V / R</code> (how much current flows at a given
          voltage and resistance) and <code>R = V / I</code> (the
          resistance needed to limit current to a target value). Those
          three forms are all the math a beginner needs.
        </p>
      </Section>

      <Section title="Interactive calculator">
        <p className="text-sm leading-relaxed mb-4">
          Drag the sliders below. Fix any two values and the third updates
          in real time. Use the <strong className="text-gray-200">Lock</strong>{" "}
          buttons to choose which quantity is calculated from the other two.
        </p>
        <OhmsLawCalculator />
      </Section>

      <Section title="Worked example 1 — how much current?">
        <p className="text-sm leading-relaxed">
          You have a 5 V supply and a 1 kΩ resistor in series. How much
          current flows?
        </p>
        <p className="mt-2 text-sm leading-relaxed font-mono text-gray-200">
          I = V / R = 5 V / 1000 Ω = 0.005 A = 5 mA
        </p>
      </Section>

      <Section title="Worked example 2 — what resistor to pick?">
        <p className="text-sm leading-relaxed">
          You want 10 mA flowing through a resistor on a 5 V rail. What
          value do you need?
        </p>
        <p className="mt-2 text-sm leading-relaxed font-mono text-gray-200">
          R = V / I = 5 V / 0.01 A = 500 Ω
        </p>
        <p className="text-sm leading-relaxed">
          Round up to a standard value (470 Ω or 560 Ω) and you're done.
        </p>
      </Section>

      <Section title="Worked example 3 — the blink LED resistor">
        <p className="text-sm leading-relaxed">
          An Arduino pin is 5 V; a red LED has a forward voltage of
          about 2 V; you want ~15 mA through it. The resistor has to
          drop the remaining 3 V. So:
        </p>
        <p className="mt-2 text-sm leading-relaxed font-mono text-gray-200">
          R = V / I = (5 − 2) V / 0.015 A = 200 Ω
        </p>

        <Figure caption="The canonical Arduino LED circuit — 5 V, resistor, LED, ground.">
          <Schematic cols={12} rows={5} title="Arduino LED circuit: D13 → 220Ω → LED → GND">
            <Schematic.ArduinoPin at={[2, 2]} pin="D13" />
            <Schematic.Wire points={[[2, 2], [3, 2]]} />
            <Schematic.Resistor from={[3, 2]} to={[7, 2]} label="220Ω" />
            <Schematic.Wire points={[[7, 2], [8, 2]]} />
            <Schematic.Led from={[8, 2]} to={[10, 2]} />
            <Schematic.Wire points={[[10, 2], [10, 4]]} />
            <Schematic.Ground at={[10, 4]} />
          </Schematic>
        </Figure>

        <Note>
          220 Ω is the standard Arduino kit value — it's a safe default
          close to the exact 200 Ω answer and leaves a little headroom
          for LED variation.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/resistors",
          "electronics/leds",
          "programming/digital-io",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Interactive Ohm's Law Calculator ──────────────────────────────────────
//
// Three sliders (V, I, R). The "solved" quantity (locked = false) is
// computed from the other two. Clicking a label locks/unlocks it.

type OhmsVariable = "V" | "I" | "R"

type SliderConfig = {
  min: number
  max: number
  step: number
  unit: string
  format: (v: number) => string
}

const CONFIGS: Record<OhmsVariable, SliderConfig> = {
  V: { min: 0.1, max: 24, step: 0.1, unit: "V", format: (v) => `${v.toFixed(1)} V` },
  I: { min: 0.1, max: 500, step: 0.1, unit: "mA", format: (v) => `${v.toFixed(1)} mA` },
  R: { min: 1, max: 10000, step: 1, unit: "Ω", format: (v) => `${Math.round(v)} Ω` },
}

function OhmsLawCalculator() {
  // I stored in mA internally for slider UX; convert to A for math
  const [voltage, setVoltage] = useState(5)
  const [currentMa, setCurrentMa] = useState(20)
  const [resistance, setResistance] = useState(250)

  // Which variable is derived (computed from the other two)
  const [solved, setSolved] = useState<OhmsVariable>("R")

  const vId = useId()
  const iId = useId()
  const rId = useId()

  // Derived values — recalculate the solved variable
  const displayV = solved === "V" ? (currentMa / 1000) * resistance : voltage
  const displayI = solved === "I" ? (voltage / resistance) * 1000 : currentMa
  const displayR = solved === "R" ? voltage / (currentMa / 1000) : resistance

  // Clamp derived values to slider bounds so display stays valid
  const clampedV = Math.min(CONFIGS.V.max, Math.max(CONFIGS.V.min, displayV))
  const clampedI = Math.min(CONFIGS.I.max, Math.max(CONFIGS.I.min, displayI))
  const clampedR = Math.min(CONFIGS.R.max, Math.max(CONFIGS.R.min, displayR))

  function lockTo(v: OhmsVariable) {
    setSolved(v)
  }

  function handleChange(variable: OhmsVariable, raw: number) {
    if (variable === "V") setVoltage(raw)
    if (variable === "I") setCurrentMa(raw)
    if (variable === "R") setResistance(raw)
  }

  const rows: { key: OhmsVariable; id: string; value: number; displayValue: number }[] = [
    { key: "V", id: vId, value: voltage, displayValue: clampedV },
    { key: "I", id: iId, value: currentMa, displayValue: clampedI },
    { key: "R", id: rId, value: resistance, displayValue: clampedR },
  ]

  return (
    <div className="rounded-md border border-neutral-800 bg-[#0d0d0d] p-4 space-y-5">
      {rows.map(({ key, id, value, displayValue }) => {
        const cfg = CONFIGS[key]
        const isSolved = solved === key
        const sliderValue = isSolved ? displayValue : value
        const pct = ((sliderValue - cfg.min) / (cfg.max - cfg.min)) * 100

        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-gray-200 w-4">{key}</span>
                <button
                  type="button"
                  onClick={() => lockTo(key)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors",
                    isSolved
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                      : "bg-neutral-800 text-neutral-500 border border-neutral-700 hover:bg-neutral-700 hover:text-neutral-300",
                  )}
                  aria-pressed={isSolved}
                  title={isSolved ? "Currently calculated from other values" : "Click to calculate this value"}
                >
                  {isSolved ? "Calculated" : "Lock"}
                </button>
              </div>
              <span className="font-mono text-sm text-gray-300 tabular-nums min-w-[90px] text-right">
                {cfg.format(displayValue)}
              </span>
            </div>
            <label htmlFor={id} className="sr-only">{key} slider</label>
            <div className="relative h-2 rounded-full bg-neutral-800">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-blue-500/60"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <input
                id={id}
                type="range"
                min={cfg.min}
                max={cfg.max}
                step={cfg.step}
                value={sliderValue}
                disabled={isSolved}
                onChange={(e) => handleChange(key, parseFloat(e.target.value))}
                className={cn(
                  "absolute inset-0 w-full h-full opacity-0 cursor-pointer",
                  isSolved && "cursor-not-allowed",
                )}
                aria-valuetext={cfg.format(displayValue)}
              />
            </div>
          </div>
        )
      })}

      <p className="text-[11px] text-neutral-500 pt-1 border-t border-neutral-800">
        The amber "Calculated" field is derived from the other two. Click any label's <strong className="text-neutral-400">Lock</strong> button to solve for a different variable.
      </p>
    </div>
  )
}

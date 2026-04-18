// Arduino Uno Reference > Signals & timing > PWM on the Uno

import { useState, useId } from "react"
import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
  Figure,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function PwmPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "pwm",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="PWM on the Uno"
        subtitle="Six pins that can fake an analog voltage by switching on and off really fast."
      />

      <Section title="What is PWM?">
        <p className="text-sm leading-relaxed">
          <Term k="pwm">Pulse Width Modulation</Term> is a technique where a
          digital pin switches between HIGH and LOW thousands of times per
          second. By varying the ratio of on-time to off-time (the{" "}
          <Term k="duty-cycle">duty cycle</Term>), the average voltage seen
          by a component changes. An LED at 50% duty cycle looks roughly
          half as bright; a motor at 75% runs roughly three-quarters speed.
        </p>
      </Section>

      <Section title="Which pins support PWM">
        <p className="text-sm leading-relaxed">
          On the Arduino Uno, exactly six digital pins can do PWM output.
          They are marked with a <code>~</code> on the board silkscreen.
        </p>

        <Table
          headers={["Pin", "Timer", "Default frequency"]}
          rows={[
            ["D3", "Timer 2", "490 Hz"],
            ["D5", "Timer 0", "980 Hz"],
            ["D6", "Timer 0", "980 Hz"],
            ["D9", "Timer 1", "490 Hz"],
            ["D10", "Timer 1", "490 Hz"],
            ["D11", "Timer 2", "490 Hz"],
          ]}
        />

        <Note>
          Pins D5 and D6 run at 980 Hz because they share Timer 0, which
          the Arduino core also uses for <Term k="millis">millis()</Term>{" "}
          and <Term k="delay">delay()</Term>. The other four PWM pins run
          at 490 Hz.
        </Note>
      </Section>

      <Section title="Duty cycle explorer">
        <p className="text-sm leading-relaxed">
          Drag the slider to change the{" "}
          <Term k="analog-write">analogWrite()</Term> value (0–255) and see
          the resulting waveform, average voltage, and perceived LED
          brightness in real time.
        </p>
        <DutyCycleExplorer />
      </Section>

      <Section title="Using analogWrite()">
        <p className="text-sm leading-relaxed">
          Call <code className="text-gray-200">analogWrite(pin, value)</code>{" "}
          where <code>value</code> is 0 (always LOW) to 255 (always HIGH).
          You do <strong className="text-gray-200">not</strong> need to call{" "}
          <code>pinMode(pin, OUTPUT)</code> first — <code>analogWrite</code>{" "}
          sets the pin to output mode automatically.
        </p>

        <CodeBlock code={`// Fade an LED on pin 9
int led = 9;

void setup() {
  // No pinMode needed for analogWrite
}

void loop() {
  for (int brightness = 0; brightness <= 255; brightness++) {
    analogWrite(led, brightness);
    delay(5);
  }
}`} />
      </Section>

      <SeeAlso
        refs={[
          "programming/analog-io",
          "electronics/pwm",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Duty cycle explorer ────────────────────────────────────────────────────

function DutyCycleExplorer() {
  const [value, setValue] = useState(128)
  const sliderId = useId()

  const duty = value / 255
  const vAvg = (duty * 5).toFixed(2)
  const pct = Math.round(duty * 100)

  return (
    <div className="rounded-md border border-neutral-800 bg-[#0d0d0d] p-4 space-y-4">
      {/* Slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor={sliderId} className="text-sm text-gray-300">
            analogWrite value
          </label>
          <span className="font-mono text-sm text-gray-200 tabular-nums">{value} / 255</span>
        </div>
        <div className="relative h-2 rounded-full bg-neutral-800">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-500/60"
            style={{ width: `${(value / 255) * 100}%` }}
            aria-hidden
          />
          <input
            id={sliderId}
            type="range"
            min={0}
            max={255}
            step={1}
            value={value}
            onChange={(e) => setValue(parseInt(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-valuetext={`${value} — ${pct}% duty cycle, ${vAvg} V average`}
          />
        </div>
        <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
          <span>0 (always LOW)</span>
          <span>255 (always HIGH)</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="Duty cycle" value={`${pct}%`} color="text-blue-400" />
        <StatBox label="Avg voltage" value={`${vAvg} V`} color="text-emerald-400" />
        <StatBox label="LED brightness" value={brightnessLabel(duty)} color="text-amber-400" />
      </div>

      {/* Waveform visualization */}
      <div>
        <p className="text-[11px] text-neutral-500 mb-2 uppercase tracking-wider font-semibold">
          Waveform (4 cycles shown)
        </p>
        <PwmWaveform duty={duty} />
      </div>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-center">
      <p className="text-[10px] text-neutral-500 mb-1">{label}</p>
      <p className={`font-mono text-base font-semibold ${color}`}>{value}</p>
    </div>
  )
}

function brightnessLabel(duty: number): string {
  if (duty === 0) return "Off"
  if (duty < 0.1) return "Barely"
  if (duty < 0.33) return "Dim"
  if (duty < 0.67) return "Medium"
  if (duty < 0.9) return "Bright"
  if (duty < 1) return "Very bright"
  return "Full"
}

function PwmWaveform({ duty }: { duty: number }) {
  const w = 480
  const h = 60
  const cycles = 4
  const cycleW = w / cycles
  const high = 8
  const low = h - 8
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"

  const segments: string[] = []
  for (let c = 0; c < cycles; c++) {
    const x0 = c * cycleW
    const onW = cycleW * duty
    const offW = cycleW - onW
    if (duty === 0) {
      segments.push(`${x0},${low} ${x0 + cycleW},${low}`)
    } else if (duty >= 1) {
      segments.push(`${x0},${high} ${x0 + cycleW},${high}`)
    } else {
      segments.push(
        `${x0},${high} ${x0 + onW},${high} ${x0 + onW},${low} ${x0 + offW + x0},${low}`
      )
    }
  }

  // Build a single polyline path
  const allPoints: [number, number][] = []
  for (let c = 0; c < cycles; c++) {
    const x0 = c * cycleW
    const onW = cycleW * duty
    if (duty === 0) {
      allPoints.push([x0, low], [x0 + cycleW, low])
    } else if (duty >= 1) {
      allPoints.push([x0, high], [x0 + cycleW, high])
    } else {
      allPoints.push([x0, high], [x0 + onW, high], [x0 + onW, low], [x0 + cycleW, low])
    }
  }
  const points = allPoints.map(([x, y]) => `${x.toFixed(1)},${y}`).join(" ")

  return (
    <div className="flex justify-center rounded border border-neutral-800 bg-neutral-900 py-2">
      <svg
        viewBox={`0 0 ${w} ${h + 16}`}
        width={w}
        height={h + 16}
        className="max-w-full"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`PWM waveform at ${Math.round(duty * 100)}% duty cycle`}
      >
        {/* Rails */}
        <line x1={0} y1={high} x2={w} y2={high} stroke="#27272a" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={0} y1={low} x2={w} y2={low} stroke="#27272a" strokeWidth={1} strokeDasharray="3 3" />
        <text x={2} y={high - 2} fontSize={9} fill="#52525b" fontFamily={mono}>5V</text>
        <text x={2} y={low + 9} fontSize={9} fill="#52525b" fontFamily={mono}>0V</text>
        {/* Waveform */}
        <polyline
          points={points}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={2}
          strokeLinejoin="miter"
        />
        {/* Average line */}
        {duty > 0 && duty < 1 && (
          <line
            x1={0}
            y1={high + (low - high) * (1 - duty)}
            x2={w}
            y2={high + (low - high) * (1 - duty)}
            stroke="#10b981"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
      </svg>
    </div>
  )
}

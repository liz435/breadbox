// Arduino Programming > Arduino API > Math helpers

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  CodeBlock,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function MathHelpersPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "math-helpers",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Math helpers"
        subtitle="The handful of functions that turn raw sensor numbers into useful values."
      />

      <Section title="Reference">
        <Table
          headers={["Function", "What it does"]}
          rows={[
            ["map(v, fromLo, fromHi, toLo, toHi)", "Rescale v from one range to another (integer math)."],
            ["constrain(v, lo, hi)", "Clamp v so it never goes below lo or above hi."],
            ["min(a, b)", "The smaller of a and b."],
            ["max(a, b)", "The larger of a and b."],
            ["abs(v)", "Absolute value — drop the sign."],
            ["random(min, max)", "Pseudo-random integer in [min, max). Seed with randomSeed()."],
            ["pow(base, exp)", "base raised to exp. Floating point."],
            ["sqrt(v)", "Square root. Floating point."],
          ]}
        />
      </Section>

      <Section title="map() — the one you'll use constantly">
        <p className="text-sm leading-relaxed">
          <code className="text-gray-200">
            map(value, fromLow, fromHigh, toLow, toHigh)
          </code>{" "}
          linearly rescales a number. The two ranges don't have to be
          related — any mapping will do. It's the standard way to turn
          the 0–1023 output of <code>analogRead()</code> into the
          0–255 range of <code>analogWrite()</code>, or into a servo
          angle, or into a PWM duty cycle.
        </p>

        <CodeBlock code={`int raw = analogRead(A0);            // 0..1023
int bright = map(raw, 0, 1023, 0, 255); // scale to PWM range
bright = constrain(bright, 0, 255);   // belt and suspenders
analogWrite(9, bright);`} />

        <Figure caption="constrain(x, 0, 100) passes values through linearly inside the range and clips everything outside.">
          <ConstrainDiagram />
        </Figure>

        <Note>
          <code>map()</code> on AVR uses integer math and truncates
          toward zero. It doesn't clamp — feed it a value outside
          the input range and you'll get a result outside the output
          range. Pair it with <code>constrain()</code> whenever the
          input isn't guaranteed to be in bounds.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/analog-io",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── constrain() clipping diagram ───────────────────────────────────────

function ConstrainDiagram() {
  const w = 440
  const h = 260
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const ox = 60
  const oy = 210
  const axW = 340
  const axH = 170
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Axes */}
        <line x1={ox} y1={oy} x2={ox + axW} y2={oy} stroke="#6b7280" strokeWidth={1.5} />
        <line x1={ox} y1={oy} x2={ox} y2={oy - axH} stroke="#6b7280" strokeWidth={1.5} />
        <text x={ox + axW / 2} y={oy + 30} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>input x</text>
        <text x={15} y={oy - axH / 2} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono} transform={`rotate(-90 15 ${oy - axH / 2})`}>output</text>

        {/* 100 horizontal guide */}
        <line x1={ox} y1={oy - 120} x2={ox + axW} y2={oy - 120} stroke="#27272a" strokeWidth={1} strokeDasharray="3,3" />
        <text x={ox - 8} y={oy - 116} textAnchor="end" fontSize={9} fill="#9ca3af" fontFamily={mono}>100</text>
        <text x={ox - 8} y={oy + 4} textAnchor="end" fontSize={9} fill="#9ca3af" fontFamily={mono}>0</text>

        {/* Input = output inside the range (diagonal), clipped outside */}
        <line x1={ox} y1={oy} x2={ox + 80} y2={oy} stroke="#ef4444" strokeWidth={2.5} />
        <line x1={ox + 80} y1={oy} x2={ox + 200} y2={oy - 120} stroke="#10b981" strokeWidth={2.5} />
        <line x1={ox + 200} y1={oy - 120} x2={ox + axW} y2={oy - 120} stroke="#ef4444" strokeWidth={2.5} />

        {/* Labels */}
        <text x={ox + 40} y={oy + 16} textAnchor="middle" fontSize={9} fill="#ef4444" fontFamily={mono}>x &lt; 0</text>
        <text x={ox + 140} y={oy - 75} textAnchor="middle" fontSize={9} fill="#10b981" fontFamily={mono}>linear</text>
        <text x={ox + 270} y={oy - 128} textAnchor="middle" fontSize={9} fill="#ef4444" fontFamily={mono}>x &gt; 100 → clipped at 100</text>

        {/* Boundary markers */}
        <line x1={ox + 80} y1={oy + 4} x2={ox + 80} y2={oy - 4} stroke="#9ca3af" strokeWidth={1.5} />
        <text x={ox + 80} y={oy + 18} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily={mono}>0</text>
        <line x1={ox + 200} y1={oy + 4} x2={ox + 200} y2={oy - 4} stroke="#9ca3af" strokeWidth={1.5} />
        <text x={ox + 200} y={oy + 18} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily={mono}>100</text>

        <text x={w / 2} y={20} textAnchor="middle" fontSize={11} fill="#a78bfa" fontFamily={mono}>constrain(x, 0, 100)</text>
      </svg>
    </div>
  )
}

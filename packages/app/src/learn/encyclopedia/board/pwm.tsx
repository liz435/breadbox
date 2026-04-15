// Arduino Uno Reference > Signals & timing > PWM on the Uno

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

      <Section title="Duty cycle timing">
        <p className="text-sm leading-relaxed">
          The diagram below shows what happens on a PWM pin at three
          different <Term k="analog-write">analogWrite()</Term> values.
          The pin voltage alternates between 0 V and 5 V; only the
          proportion of time spent HIGH changes.
        </p>

        <Figure caption="PWM duty cycles: 0% (always LOW), 50% (half on), 100% (always HIGH).">
          <DutyCycleDiagram />
        </Figure>
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

// ── Duty cycle timing diagram ──────────────────────────────────────────

function DutyCycleDiagram() {
  const w = 400
  const rowH = 50
  const labelW = 60
  const waveW = w - labelW - 20
  const rows = [
    { label: "0%", value: 0 },
    { label: "50%", value: 128 },
    { label: "100%", value: 255 },
  ]

  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${rows.length * rowH + 10}`}
        width={w}
        height={rows.length * rowH + 10}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {rows.map((row, i) => {
          const y = i * rowH + 10
          const high = y + 4
          const low = y + rowH - 14
          const duty = row.value / 255
          const cycles = 4
          const cycleW = waveW / cycles

          return (
            <g key={row.label}>
              <text
                x={labelW - 8}
                y={y + rowH / 2}
                textAnchor="end"
                fontSize={11}
                fill="#d1d5db"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {row.label}
              </text>
              {Array.from({ length: cycles }, (_, c) => {
                const cx = labelW + c * cycleW
                const onW = cycleW * duty
                const offW = cycleW - onW
                const points =
                  duty === 0
                    ? `${cx},${low} ${cx + cycleW},${low}`
                    : duty === 1
                      ? `${cx},${high} ${cx + cycleW},${high}`
                      : `${cx},${high} ${cx + onW},${high} ${cx + onW},${low} ${cx + cycleW},${low}`
                return (
                  <polyline
                    key={c}
                    points={points}
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth={2}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

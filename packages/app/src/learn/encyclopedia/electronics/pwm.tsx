// Electronics Fundamentals > Signals > PWM as fake analog

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function ElectronicsPwmPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "pwm",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="PWM as fake analog"
        subtitle="How you fake a continuous voltage using only two states."
      />

      <Section title="The problem">
        <p className="text-sm leading-relaxed">
          A microcontroller pin is digital — it can only be HIGH (5 V)
          or LOW (0 V). There's no in-between. But sometimes you want
          "half on," like a dim LED or a slow motor. How do you get a
          halfway voltage out of a pin with only two states?
        </p>
      </Section>

      <Section title="The trick: switch very fast">
        <p className="text-sm leading-relaxed">
          <Term k="pwm">Pulse Width Modulation</Term> cheats by flipping
          the pin between HIGH and LOW hundreds of times a second. Over
          a short time window, the{" "}
          <em className="text-gray-200">average</em> voltage is a
          fraction of 5 V — determined by what fraction of the time the
          pin was HIGH versus LOW. Components that respond slowly
          (LEDs, motors, your eye) see only the average.
        </p>
      </Section>

      <Section title="Duty cycle">
        <p className="text-sm leading-relaxed">
          The <Term k="duty-cycle">duty cycle</Term> is the fraction of
          the time the pin is HIGH during one cycle. A 50% duty cycle
          means HIGH for half the cycle and LOW for the other half —
          the average voltage is 2.5 V. A 25% duty cycle averages to
          1.25 V. A 100% duty cycle is just "always on."
        </p>

        <Figure caption="Three duty cycles on the same pin: 0%, 50%, and 100%.">
          <DutyDiagram />
        </Figure>
      </Section>

      <Section title="Frequency matters too">
        <p className="text-sm leading-relaxed">
          The duty cycle sets the average voltage, but the{" "}
          <strong className="text-gray-200">frequency</strong> determines
          whether the trick works. Too slow and you'll see the pulses
          as a flicker. The Arduino Uno's default PWM frequency (about
          490 Hz) is fast enough for LEDs and motors but too slow for
          audio. Most PWM pins on the Uno are set up to run at that
          rate out of the box.
        </p>

        <Note>
          PWM only fakes an analog voltage. If you hook a scope to the
          pin you see a square wave, not a smooth line. For anything
          that cares about true analog (audio, precision sensors), you
          need either a low-pass filter on the PWM or a dedicated DAC.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/pwm",
          "programming/analog-io",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Duty cycle diagram ─────────────────────────────────────────────────

function DutyDiagram() {
  const w = 400
  const rowH = 50
  const labelW = 60
  const waveW = w - labelW - 20
  const rows = [
    { label: "0%", duty: 0 },
    { label: "50%", duty: 0.5 },
    { label: "100%", duty: 1 },
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
                const onW = cycleW * row.duty
                const points =
                  row.duty === 0
                    ? `${cx},${low} ${cx + cycleW},${low}`
                    : row.duty === 1
                      ? `${cx},${high} ${cx + cycleW},${high}`
                      : `${cx},${high} ${cx + onW},${high} ${cx + onW},${low} ${cx + cycleW},${low}`
                return (
                  <polyline
                    key={c}
                    points={points}
                    fill="none"
                    stroke="#f59e0b"
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

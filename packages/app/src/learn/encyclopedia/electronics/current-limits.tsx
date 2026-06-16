// Electronics Fundamentals > Practical > Current limits for Arduino pins

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function CurrentLimitsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "current-limits",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Current limits for Arduino pins"
        subtitle="The numbers that separate a safe sketch from a dead ATmega."
      />

      <Section title="The limits that matter">
        <p className="text-sm leading-relaxed">
          The ATmega328P's I/O pins can source or sink a surprising
          amount of current for an 8-bit chip, but it has three
          nested ceilings you have to stay under. Blow past any one
          and you risk frying the MCU — silicon death is not
          covered by warranty.
        </p>

        <Table
          headers={["Limit", "Value", "Notes"]}
          rows={[
            ["Per pin (safe)", "20 mA", "Design target. Comfortable for LEDs."],
            ["Per pin (absolute max)", "40 mA", "Don't run continuously at this level."],
            ["Per port group", "100 mA", "PORTD (D0–D7), PORTB (D8–D13), PORTC (A0–A5)"],
            ["Whole chip", "200 mA", "Sum of every pin combined."],
            ["5V pin from USB", "~500 mA", "Limited by polyfuse / USB host."],
            ["5V pin from barrel jack", "~800 mA", "Limited by onboard regulator."],
          ]}
        />

        <Figure caption="The nested ceilings — stay under all of them at once.">
          <NestedLimitsDiagram />
        </Figure>
      </Section>

      <Section title="Port groups catch you by surprise">
        <p className="text-sm leading-relaxed">
          The 100 mA-per-port limit is the sneaky one. You can have
          eight pins, each drawing 15 mA (well under the per-pin
          ceiling), but if they're all on PORTB you're at 120 mA —
          over. Adding up loads per individual pin isn't enough;
          check the group total too.
        </p>
      </Section>

      <Section title="The rule: anything over 20 mA needs a helper">
        <p className="text-sm leading-relaxed">
          A single LED at 10–15 mA? Drive it straight from a digital
          pin. A small buzzer? Fine. A servo's signal line? Fine —
          the servo takes its own power from the 5 V rail, not the
          pin. Anything that actually{" "}
          <em className="text-foreground">does</em> something
          physical — a motor, a relay coil, a bright LED strip — is
          almost certainly over 20 mA and needs a transistor,
          MOSFET, or motor driver between it and the Arduino.
        </p>

        <Warn>
          Never drive a DC motor directly from an Arduino pin, no
          matter how small the motor looks. The inrush current at
          startup is many times the steady-state draw, and the
          inductive kickback when you switch it off will murder the
          pin driver. Use a transistor with a flyback diode, or a
          proper motor driver IC.
        </Warn>

        <Note>
          The 500 mA USB limit includes everything drawing from the
          5 V rail, not just pin outputs. If you power a sensor or
          an LED strip from 5 V, that current counts against the
          same budget.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/power-pins",
          "board/powering",
          "electronics/power",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Nested current-limit diagram ───────────────────────────────────────

function NestedLimitsDiagram() {
  const w = 440
  const h = 200
  const levels = [
    { label: "USB total  500 mA", size: 190, color: "#ef4444" },
    { label: "Chip total  200 mA", size: 146, color: "#f59e0b" },
    { label: "Port group  100 mA", size: 104, color: "#10b981" },
    { label: "Per pin  20 mA", size: 60, color: "#60a5fa" },
  ]
  const cx = w / 2
  const cy = h / 2 + 6
  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />
        {levels.map((lvl) => (
          <g key={lvl.label}>
            <rect
              x={cx - lvl.size}
              y={cy - lvl.size / 2}
              width={lvl.size * 2}
              height={lvl.size}
              rx={6}
              fill={lvl.color}
              fillOpacity={0.08}
              stroke={lvl.color}
              strokeWidth={1.4}
            />
            <text
              x={cx - lvl.size + 6}
              y={cy - lvl.size / 2 + 12}
              fontSize={10}
              fill={lvl.color}
              fontFamily="ui-monospace, Menlo, monospace"
            >
              {lvl.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// Arduino Uno Reference > Signals & timing > Timers on the Uno

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
import { Term } from "../../term"

export function TimersPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "timers",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Timers on the Uno"
        subtitle="Three hardware counters that keep time, generate PWM, and explain why delay() blocks."
      />

      <Section title="What is a hardware timer?">
        <p className="text-sm leading-relaxed">
          A hardware timer is a counter inside the ATmega328P that ticks
          independently of your sketch code. The CPU sets it up, then the
          counter runs on its own — counting clock cycles, triggering
          events, and generating <Term k="pwm">PWM</Term> signals without
          any further CPU involvement.
        </p>
      </Section>

      <Section title="The three timers">
        <Table
          headers={["Timer", "Bits", "Used by Arduino core for…", "PWM pins"]}
          rows={[
            ["Timer 0", "8-bit", "millis(), micros(), delay()", "D5, D6"],
            ["Timer 1", "16-bit", "Servo library", "D9, D10"],
            ["Timer 2", "8-bit", "tone()", "D3, D11"],
          ]}
        />

        <Note>
          Because Timer 0 drives <Term k="millis">millis()</Term> and{" "}
          <Term k="delay">delay()</Term>, changing its configuration
          breaks timekeeping. Avoid modifying Timer 0 unless you know
          what you're doing.
        </Note>
      </Section>

      <Section title="Why delay() blocks">
        <p className="text-sm leading-relaxed">
          When you call <code className="text-foreground">delay(1000)</code>,
          the Arduino core reads the current <code>millis()</code> value
          and then sits in a tight loop, doing nothing, until{" "}
          <code>millis()</code> has advanced by 1000. During that time your
          sketch cannot read sensors, respond to buttons, or do anything
          else. The timer itself keeps ticking (it's hardware), but your
          code is stuck waiting.
        </p>

        <Figure caption="Two sketches running for one second. delay() blocks the loop so nothing else runs; millis() lets loop() keep iterating and the sketch can do work between blinks.">
          <BlockingVsNonBlockingDiagram />
        </Figure>

        <Warn>
          This is why experienced Arduino programmers avoid{" "}
          <code>delay()</code> in anything but the simplest sketches. The
          alternative is the <Term k="non-blocking">non-blocking</Term>{" "}
          millis() pattern — check the time each loop iteration and act
          only when enough time has passed.
        </Warn>
      </Section>

      <Section title="Why millis() doesn't block">
        <p className="text-sm leading-relaxed">
          <code className="text-foreground">millis()</code> just reads
          Timer 0's overflow count and returns it. The timer overflows
          roughly every millisecond (the Arduino core sets up a prescaler
          so this works out). Reading a counter is instant — no waiting,
          no blocking. That's why the non-blocking pattern works: you
          compare the current <code>millis()</code> value against a saved
          timestamp, and only act when the difference is large enough.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "programming/timing",
          "programming/non-blocking-timing",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── delay() vs millis() timeline ───────────────────────────────────────

function BlockingVsNonBlockingDiagram() {
  const w = 560
  const rowH = 90
  const h = 2 * rowH + 30
  const padL = 120
  const padR = 20
  const trackW = w - padL - padR

  const Row = ({
    y,
    title,
    subtitle,
    segments,
  }: {
    y: number
    title: string
    subtitle: string
    segments: {
      start: number
      end: number
      kind: "blocked" | "loop" | "work"
    }[]
  }) => (
    <g>
      <text
        x={padL - 10}
        y={y + 22}
        textAnchor="end"
        fontSize={12}
        fill="#d1d5db"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={600}
      >
        {title}
      </text>
      <text
        x={padL - 10}
        y={y + 36}
        textAnchor="end"
        fontSize={9}
        fill="#6b7280"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {subtitle}
      </text>

      {/* Track background */}
      <rect
        x={padL}
        y={y + 14}
        width={trackW}
        height={26}
        rx={3}
        fill="#18181b"
        stroke="#27272a"
        strokeWidth={0.8}
      />

      {/* Segments */}
      {segments.map((s, i) => {
        const x = padL + s.start * trackW
        const wSeg = (s.end - s.start) * trackW
        const color =
          s.kind === "blocked"
            ? "#ef4444"
            : s.kind === "work"
              ? "#10b981"
              : "#60a5fa"
        return (
          <rect
            key={i}
            x={x}
            y={y + 16}
            width={wSeg}
            height={22}
            rx={2}
            fill={color}
            fillOpacity={0.25}
            stroke={color}
            strokeWidth={1.2}
          />
        )
      })}

      {/* Time axis */}
      <line
        x1={padL}
        y1={y + 54}
        x2={padL + trackW}
        y2={y + 54}
        stroke="#27272a"
        strokeWidth={0.8}
      />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line
            x1={padL + t * trackW}
            y1={y + 52}
            x2={padL + t * trackW}
            y2={y + 58}
            stroke="#6b7280"
            strokeWidth={0.8}
          />
          <text
            x={padL + t * trackW}
            y={y + 70}
            textAnchor="middle"
            fontSize={9}
            fill="#6b7280"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {(t * 1000).toFixed(0)} ms
          </text>
        </g>
      ))}
    </g>
  )

  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Legend */}
        <g transform={`translate(${padL}, 0)`}>
          <rect x={0} y={0} width={10} height={10} fill="#ef4444" fillOpacity={0.25} stroke="#ef4444" />
          <text x={14} y={9} fontSize={9} fill="#9ca3af" fontFamily="ui-sans-serif, system-ui, sans-serif">
            blocked in delay()
          </text>
          <rect x={140} y={0} width={10} height={10} fill="#60a5fa" fillOpacity={0.25} stroke="#60a5fa" />
          <text x={154} y={9} fontSize={9} fill="#9ca3af" fontFamily="ui-sans-serif, system-ui, sans-serif">
            loop() iteration
          </text>
          <rect x={260} y={0} width={10} height={10} fill="#10b981" fillOpacity={0.25} stroke="#10b981" />
          <text x={274} y={9} fontSize={9} fill="#9ca3af" fontFamily="ui-sans-serif, system-ui, sans-serif">
            other work (sensors, buttons)
          </text>
        </g>

        <Row
          y={20}
          title="delay(500)"
          subtitle="blocking"
          segments={[
            { start: 0, end: 0.02, kind: "loop" },
            { start: 0.02, end: 0.5, kind: "blocked" },
            { start: 0.5, end: 0.52, kind: "loop" },
            { start: 0.52, end: 1, kind: "blocked" },
          ]}
        />

        <Row
          y={20 + rowH}
          title="millis() pattern"
          subtitle="non-blocking"
          segments={[
            ...Array.from(
              { length: 20 },
              (_, i): { start: number; end: number; kind: "blocked" | "loop" | "work" } => ({
                start: i / 20,
                end: i / 20 + 0.012,
                kind: "loop",
              }),
            ),
            ...Array.from(
              { length: 20 },
              (_, i): { start: number; end: number; kind: "blocked" | "loop" | "work" } => ({
                start: i / 20 + 0.014,
                end: i / 20 + 0.048,
                kind: "work",
              }),
            ),
          ]}
        />
      </svg>
    </div>
  )
}

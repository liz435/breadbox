// Arduino Programming > Arduino API > Timing

import {
  LearnLayout,
  PageTitle,
  Section,
  Warn,
  Note,
  Table,
  CodeBlock,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function TimingPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "timing",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Timing"
        subtitle="Four functions that cover 99% of time-related code."
      />

      <Section title="The four functions">
        <Table
          headers={["Function", "Units", "Blocks?"]}
          rows={[
            ["delay(ms)", "milliseconds", "Yes — halts the sketch"],
            ["delayMicroseconds(us)", "microseconds", "Yes — halts the sketch"],
            ["millis()", "milliseconds since boot", "No — just reads a counter"],
            ["micros()", "microseconds since boot", "No — just reads a counter"],
          ]}
        />
      </Section>

      <Section title="delay() — the simple hammer">
        <p className="text-sm leading-relaxed">
          <Term k="delay">delay()</Term> pauses the sketch for the given
          number of milliseconds. It's the first timing tool beginners
          reach for, and the most abused.
        </p>

        <CodeBlock code={`digitalWrite(13, HIGH);
delay(500);     // wait half a second
digitalWrite(13, LOW);
delay(500);`} />

        <Warn>
          While <code>delay()</code> is running, your sketch can't read
          buttons, poll sensors, respond to Serial, or run any other
          code. Using <code>delay()</code> in anything beyond a single
          blinking LED almost always bites you later.
        </Warn>

        <Figure caption="delay() blocks the whole sketch. millis() just reads a counter — tick marks let you react whenever you want.">
          <TimingCompareDiagram />
        </Figure>
      </Section>

      <Section title="delayMicroseconds() — for short waits">
        <p className="text-sm leading-relaxed">
          Same as <code>delay()</code> but with microsecond granularity.
          Use it when you need waits under a millisecond — for example
          when bit-banging a serial protocol. Accuracy is good up to a
          few thousand microseconds; beyond that, switch to{" "}
          <code>delay()</code>.
        </p>
      </Section>

      <Section title="millis() — the non-blocking clock">
        <p className="text-sm leading-relaxed">
          <Term k="millis">millis()</Term> returns an{" "}
          <code>unsigned long</code> — the number of milliseconds since
          the sketch started. It's the heart of any non-blocking timing
          pattern. Reading it is instant and doesn't pause anything.
        </p>

        <CodeBlock code={`unsigned long now = millis();
if (now - lastBlink >= 500) {
  lastBlink = now;
  // do the thing
}`} />

        <Note>
          Always store timestamps in an <code>unsigned long</code>, and
          always subtract the old timestamp from the new one (rather than
          comparing <code>now &gt; lastBlink + 500</code>). The subtraction
          form works correctly even when the counter wraps at ~50 days.
        </Note>
      </Section>

      <Section title="micros() — same thing, finer">
        <p className="text-sm leading-relaxed">
          <code>micros()</code> works like <code>millis()</code> but
          counts microseconds. It wraps much sooner — about every 70
          minutes — so use it only when you need sub-millisecond
          precision.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "board/timers",
          "programming/non-blocking-timing",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── delay vs millis timeline ───────────────────────────────────────────

function TimingCompareDiagram() {
  const w = 540
  const h = 200
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const leftX = 80
  const trackW = 430
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* delay() row */}
        <text x={leftX - 10} y={55} textAnchor="end" fontSize={11} fill="#ef4444" fontFamily={mono}>delay(500)</text>
        <rect x={leftX} y={40} width={trackW} height={28} fill="#0f0f0f" stroke="#ef4444" strokeWidth={1.5} />
        <rect x={leftX + 5} y={44} width={210} height={20} fill="#ef4444" fillOpacity={0.25} />
        <text x={leftX + 110} y={58} textAnchor="middle" fontSize={10} fill="#ef4444" fontFamily={mono}>BLOCKED</text>
        <rect x={leftX + 225} y={44} width={200} height={20} fill="#ef4444" fillOpacity={0.25} />
        <text x={leftX + 325} y={58} textAnchor="middle" fontSize={10} fill="#ef4444" fontFamily={mono}>BLOCKED</text>

        {/* millis() row */}
        <text x={leftX - 10} y={135} textAnchor="end" fontSize={11} fill="#10b981" fontFamily={mono}>millis()</text>
        <line x1={leftX} y1={130} x2={leftX + trackW} y2={130} stroke="#10b981" strokeWidth={1.5} />
        {Array.from({ length: 15 }, (_, i) => {
          const x = leftX + 15 + i * 28
          return <line key={i} x1={x} y1={122} x2={x} y2={138} stroke="#10b981" strokeWidth={1.5} />
        })}
        <text x={leftX + trackW / 2} y={160} textAnchor="middle" fontSize={10} fill="#10b981" fontFamily={mono}>sketch keeps running — check the counter whenever</text>

        {/* Time axis label */}
        <text x={leftX + trackW / 2} y={185} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily={mono}>time →</text>
      </svg>
    </div>
  )
}

// Arduino Programming > Arduino API > Timing

import {
  LearnLayout,
  PageTitle,
  Section,
  Warn,
  Note,
  Table,
  CodeBlock,
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

// Arduino Uno Reference > Signals & timing > Timers on the Uno

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
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
          When you call <code className="text-gray-200">delay(1000)</code>,
          the Arduino core reads the current <code>millis()</code> value
          and then sits in a tight loop, doing nothing, until{" "}
          <code>millis()</code> has advanced by 1000. During that time your
          sketch cannot read sensors, respond to buttons, or do anything
          else. The timer itself keeps ticking (it's hardware), but your
          code is stuck waiting.
        </p>

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
          <code className="text-gray-200">millis()</code> just reads
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

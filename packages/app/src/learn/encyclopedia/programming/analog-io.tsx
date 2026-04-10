// Arduino Programming > Arduino API > Analog I/O

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  Table,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function AnalogIoPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "analog-io",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Analog I/O"
        subtitle="Reading real voltages, and faking them on the way out."
      />

      <Section title="analogRead() — 0 to 1023">
        <p className="text-sm leading-relaxed">
          <Term k="analog-read">analogRead()</Term> samples the voltage
          on an analog pin (A0 through A5) and returns an integer between
          0 and 1023. The Uno's ADC is 10-bit, which is where that range
          comes from — 2<sup>10</sup> = 1024 possible values.
        </p>

        <Table
          headers={["Pin voltage", "analogRead() value"]}
          rows={[
            ["0 V", "0"],
            ["1.25 V", "~256"],
            ["2.5 V", "~512"],
            ["3.75 V", "~768"],
            ["5 V", "1023"],
          ]}
        />

        <CodeBlock code={`int raw = analogRead(A0);                  // 0..1023
float volts = raw * (5.0 / 1023.0);        // convert to volts`} />

        <Note>
          You don't need to call <code>pinMode()</code> for analog reads.
          The ADC takes over the pin automatically.
        </Note>
      </Section>

      <Section title="analogWrite() — 0 to 255">
        <p className="text-sm leading-relaxed">
          <Term k="analog-write">analogWrite()</Term> sets a{" "}
          <Term k="pwm">PWM</Term> duty cycle on one of the six PWM pins
          (3, 5, 6, 9, 10, 11). The value is 0 to 255 — 0 is always LOW,
          255 is always HIGH, 128 is 50% duty cycle.
        </p>

        <CodeBlock code={`analogWrite(9, 0);    // off
analogWrite(9, 64);   // ~25% brightness
analogWrite(9, 128);  // ~50% brightness
analogWrite(9, 255);  // full on`} />
      </Section>

      <Section title="analogWrite() isn't really analog">
        <p className="text-sm leading-relaxed">
          The name is misleading. <code>analogWrite()</code> doesn't
          output a continuous voltage — it outputs a square wave that
          switches between 0 V and 5 V at about 490 Hz (or 980 Hz on
          pins 5 and 6). An LED looks dim because it's being turned on
          and off faster than your eye can follow. A motor runs slower
          because the average voltage across its coils is smaller.
        </p>

        <Warn>
          A PWM output is <strong>not</strong> a true analog voltage. If
          you need a real analog signal (for audio, for example), PWM
          through a low-pass filter can work, but a dedicated DAC chip
          is usually the right answer.
        </Warn>
      </Section>

      <SeeAlso
        refs={[
          "board/analog-pins",
          "board/pwm",
          "electronics/pwm",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

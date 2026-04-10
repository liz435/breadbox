// Electronics Fundamentals > Signals > Analog vs digital signals

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function AnalogVsDigitalPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "analog-vs-digital",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Analog vs digital signals"
        subtitle="Continuous voltages vs discrete ones — and how the Arduino turns the first into the second."
      />

      <Section title="Two ways to carry information">
        <p className="text-sm leading-relaxed">
          An <em className="text-gray-200">analog</em> signal is a
          voltage that can take any value within some range — a
          temperature sensor might output 0.24 V, or 0.247 V, or
          2.999 V. A <em className="text-gray-200">digital</em>{" "}
          signal only takes two values that the chip agrees to call
          HIGH (roughly 5 V on the Uno) and LOW (roughly 0 V).
          Anything in between is ambiguous and gets snapped to the
          nearest legal level.
        </p>
      </Section>

      <Section title="The ADC quantizes the analog world">
        <p className="text-sm leading-relaxed">
          To read an analog voltage from code you need a converter
          that turns it into a number. The Uno's{" "}
          <Term k="adc">analog-to-digital converter</Term> is 10
          bits wide, which means it maps the 0–5 V range onto the
          integers from 0 to 1023 — 1024 discrete steps total. Each
          step represents a voltage of about{" "}
          <code className="text-gray-200">5 V / 1024 ≈ 4.9 mV</code>
          . A reading of 512 means "somewhere between 2.495 V and
          2.500 V" — you can't tell the two apart.
        </p>
      </Section>

      <Section title="Why it matters">
        <p className="text-sm leading-relaxed">
          The 4.9 mV resolution limit is why sensor projects stack
          filters and smoothing on top of <code>analogRead()</code>:
          the underlying conversion is both quantized and noisy.
          It's also why a 3.3 V sensor connected to a 5 V-referenced
          ADC wastes a third of its range — you'll never see
          readings above ~676. For inputs that swing over less than
          the full 0–5 V, either scale them up first (op-amp gain
          stage) or change the ADC reference.
        </p>

        <Note>
          Digital isn't a magic improvement — it's a tradeoff. You
          give up precision and get noise immunity: a 5 V logic "1"
          is still a 1 after a few volts of noise. Analog is the
          other way around.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/analog-pins",
          "programming/analog-io",
          "electronics/voltage-dividers",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

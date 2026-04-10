// Arduino Programming > Arduino API > Math helpers

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  CodeBlock,
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

// Arduino Programming > C++ essentials > Floating point

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function FloatingPointPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "floating-point",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Floating point"
        subtitle="Decimal math on an 8-bit chip — slower than you'd expect, less precise than you'd hope."
      />

      <Section title="float and double are the same on AVR">
        <p className="text-sm leading-relaxed">
          <Term k="floating-point" /> numbers hold values with a
          fractional part — <code>3.14</code>, <code>-0.5</code>,{" "}
          <code>1.0e6</code>. On a desktop compiler a{" "}
          <code className="text-gray-200">double</code> is 64 bits and
          a <code className="text-gray-200">float</code> is 32. On the
          Uno's AVR chip, <em className="text-gray-200">both</em> are
          32 bits — writing <code>double</code> doesn't buy you any
          extra precision.
        </p>

        <CodeBlock code={`float  pi1 = 3.14159265;
double pi2 = 3.14159265;  // same size, same precision on AVR`} />
      </Section>

      <Section title="Precision: about six decimal digits">
        <p className="text-sm leading-relaxed">
          A 32-bit float has roughly 7 significant decimal digits, and
          in practice you can trust about 6. That's fine for sensor
          readings, smoothing, and unit conversions, but it's not
          enough to count money or represent exact fractions. Values
          like <code>0.1</code> can't be stored exactly in binary
          floating point — add <code>0.1</code> to itself ten times
          and you get <code>0.99999…</code>, not <code>1.0</code>.
        </p>
      </Section>

      <Section title="Performance cost">
        <p className="text-sm leading-relaxed">
          The AVR has no hardware floating-point unit. Every add,
          multiply, and compare on a <code>float</code> is done by a
          software library that takes dozens of instructions — roughly
          one to two orders of magnitude slower than the same
          operation on an <code>int</code>. Inside a tight loop that's
          the difference between 50 µs and 5 ms.
        </p>

        <Warn>
          Don't use <code>float</code> as a counter. Use{" "}
          <code>int</code> or <code>long</code> and convert to{" "}
          <code>float</code> only when you have to compute a ratio or
          scale a value for display.
        </Warn>

        <Note>
          Need more range than <code>long</code> but integer
          arithmetic? Use <em className="text-gray-200">fixed-point</em>:
          store your value as "hundredths of a volt" in a plain{" "}
          <code>long</code>, and only divide by 100 when it's time to
          print.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/variables",
          "programming/numeric-limits",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

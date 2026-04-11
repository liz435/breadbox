// Arduino Programming > C++ essentials > Floating point

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  Figure,
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

        <Figure caption="IEEE 754 single-precision float: 1 sign bit, 8 exponent bits, 23 mantissa bits.">
          <FloatBitsDiagram />
        </Figure>
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

// ── IEEE 754 float bit-layout diagram ──────────────────────────────────

function FloatBitsDiagram() {
  const w = 560
  const h = 170
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const totalW = 480
  const startX = 40
  const y = 50
  const rowH = 40
  const signW = totalW * (1 / 32)
  const expW = totalW * (8 / 32)
  const mantW = totalW * (23 / 32)
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Sign */}
        <rect x={startX} y={y} width={signW} height={rowH} fill="#0f0f0f" stroke="#ef4444" strokeWidth={2} />
        <text x={startX + signW / 2} y={y + rowH / 2 + 4} textAnchor="middle" fontSize={11} fill="#ef4444" fontFamily={mono}>S</text>
        <text x={startX + signW / 2} y={y + rowH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily={mono}>1</text>
        <text x={startX + signW / 2} y={y - 6} textAnchor="middle" fontSize={9} fill="#ef4444" fontFamily={mono}>sign</text>

        {/* Exponent */}
        <rect x={startX + signW} y={y} width={expW} height={rowH} fill="#0f0f0f" stroke="#f59e0b" strokeWidth={2} />
        <text x={startX + signW + expW / 2} y={y + rowH / 2 + 4} textAnchor="middle" fontSize={11} fill="#f59e0b" fontFamily={mono}>EEEEEEEE</text>
        <text x={startX + signW + expW / 2} y={y + rowH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily={mono}>8 bits</text>
        <text x={startX + signW + expW / 2} y={y - 6} textAnchor="middle" fontSize={9} fill="#f59e0b" fontFamily={mono}>exponent</text>

        {/* Mantissa */}
        <rect x={startX + signW + expW} y={y} width={mantW} height={rowH} fill="#0f0f0f" stroke="#60a5fa" strokeWidth={2} />
        <text x={startX + signW + expW + mantW / 2} y={y + rowH / 2 + 4} textAnchor="middle" fontSize={11} fill="#60a5fa" fontFamily={mono}>MMMMMMMMMMMMMMMMMMMMMMM</text>
        <text x={startX + signW + expW + mantW / 2} y={y + rowH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily={mono}>23 bits</text>
        <text x={startX + signW + expW + mantW / 2} y={y - 6} textAnchor="middle" fontSize={9} fill="#60a5fa" fontFamily={mono}>mantissa (fraction)</text>

        {/* Bottom formula */}
        <text x={w / 2} y={140} textAnchor="middle" fontSize={10} fill="#d1d5db" fontFamily={mono}>
          value = (−1)^S × 1.M × 2^(E−127)
        </text>
        <text x={w / 2} y={155} textAnchor="middle" fontSize={9} fill="#6b7280" fontFamily={mono}>
          32 bits total on both AVR and desktop
        </text>
      </svg>
    </div>
  )
}

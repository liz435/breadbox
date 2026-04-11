// Arduino Programming > Arduino API > Bit manipulation

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  Table,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function BitManipulationPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "bit-manipulation",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Bit manipulation"
        subtitle="Arduino ships a handful of helpers for reading, setting, and clearing individual bits inside a byte."
      />

      <Section title="Why bits">
        <p className="text-sm leading-relaxed">
          A <code>byte</code> holds eight independent on/off flags,
          and sometimes that's exactly what you want: the state of
          eight LEDs packed into one variable, a bitmask you're
          about to send to a shift register, or a status register
          from an SPI peripheral. The Arduino core gives you a
          small set of macros to work on one bit at a time without
          having to remember the shift-and-mask incantations.
        </p>
      </Section>

      <Section title="The helpers">
        <Table
          headers={["Macro", "What it does"]}
          rows={[
            [
              "bitRead(value, n)",
              "Returns bit n of value (0 or 1)",
            ],
            [
              "bitWrite(value, n, bit)",
              "Sets bit n of value to bit",
            ],
            [
              "bitSet(value, n)",
              "Sets bit n of value to 1",
            ],
            [
              "bitClear(value, n)",
              "Sets bit n of value to 0",
            ],
            [
              "bit(n)",
              "Returns a byte with only bit n set",
            ],
          ]}
        />

        <p className="text-sm leading-relaxed">
          Bit numbering is 0-indexed from the least significant
          bit. <code>bit(0)</code> is <code>0b00000001</code>;{" "}
          <code>bit(7)</code> is <code>0b10000000</code>.
        </p>

        <Figure caption="bitSet(b, 3) flips bit 3 of the byte from 0 to 1 — the other bits stay put.">
          <BitSetDiagram />
        </Figure>
      </Section>

      <Section title="Packing eight LEDs into one byte">
        <CodeBlock code={`byte leds = 0;

void setLed(int n, bool on) {
  if (on) {
    bitSet(leds, n);
  } else {
    bitClear(leds, n);
  }
}

bool ledIsOn(int n) {
  return bitRead(leds, n) == 1;
}

void loop() {
  setLed(0, true);
  setLed(3, true);
  // leds is now 0b00001001
}`} />

        <Note>
          These macros work on any integer type — <code>byte</code>,
          <code>int</code>, <code>long</code>. Just keep{" "}
          <code>n</code> below the width of the type (8 for a byte,
          16 for an int on the Uno).
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/operators",
          "programming/shift-out-in",
          "programming/variables",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── bitSet diagram ─────────────────────────────────────────────────────

function BitSetDiagram() {
  const w = 540
  const h = 220
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const cell = 46
  const startX = 70
  const before = [1, 0, 1, 0, 0, 0, 1, 0] // bit 7 on the left
  const after = [1, 0, 1, 0, 1, 0, 1, 0]
  const row = (y: number, label: string, bits: number[], highlightIdx: number, labelColor: string) => (
    <g>
      <text x={startX - 10} y={y + cell / 2 + 5} textAnchor="end" fontSize={11} fill={labelColor} fontFamily={mono}>{label}</text>
      {bits.map((b, i) => {
        const isH = i === highlightIdx
        return (
          <g key={i}>
            <rect
              x={startX + i * cell}
              y={y}
              width={cell - 2}
              height={cell}
              fill={isH ? "#0f0f0f" : "#0f0f0f"}
              stroke={isH ? "#f59e0b" : "#60a5fa"}
              strokeWidth={isH ? 2.5 : 1.5}
            />
            <text
              x={startX + i * cell + (cell - 2) / 2}
              y={y + cell / 2 + 6}
              textAnchor="middle"
              fontSize={18}
              fill={isH ? "#f59e0b" : "#d1d5db"}
              fontFamily={mono}
            >
              {b}
            </text>
          </g>
        )
      })}
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
        {/* Bit labels */}
        {[7, 6, 5, 4, 3, 2, 1, 0].map((n, i) => (
          <text
            key={n}
            x={startX + i * cell + (cell - 2) / 2}
            y={28}
            textAnchor="middle"
            fontSize={10}
            fill="#9ca3af"
            fontFamily={mono}
          >
            bit {n}
          </text>
        ))}
        {row(40, "before", before, 4, "#9ca3af")}
        {row(130, "after", after, 4, "#10b981")}

        {/* bitSet label */}
        <text x={w / 2} y={205} textAnchor="middle" fontSize={11} fill="#f59e0b" fontFamily={mono}>bitSet(b, 3) → flips bit 3 from 0 to 1</text>
      </svg>
    </div>
  )
}

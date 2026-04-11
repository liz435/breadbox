// Arduino Programming > Arduino API > shiftOut and shiftIn

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

export function ShiftOutInPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "shift-out-in",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="shiftOut and shiftIn"
        subtitle="Clock a byte out of one pin, or into one, bit by bit — the foundation for shift registers."
      />

      <Section title="What they do">
        <p className="text-sm leading-relaxed">
          <code>shiftOut()</code> takes a byte and walks through
          its eight bits, writing each one to a data pin and
          pulsing a clock pin between bits.{" "}
          <code>shiftIn()</code> does the opposite: it pulses the
          clock and reads the data pin eight times, assembling the
          bits back into a byte. Together they're how you talk to
          chips like the 74HC595 output shift register and the
          74HC165 input shift register.
        </p>
      </Section>

      <Section title="The signatures">
        <CodeBlock code={`shiftOut(dataPin, clockPin, bitOrder, value);
byte value = shiftIn(dataPin, clockPin, bitOrder);`} />

        <Table
          headers={["Argument", "Meaning"]}
          rows={[
            ["dataPin", "The pin the byte is written to or read from"],
            ["clockPin", "The pin pulsed HIGH/LOW between bits"],
            [
              "bitOrder",
              "MSBFIRST (bit 7 first) or LSBFIRST (bit 0 first)",
            ],
            ["value", "The byte being shifted out (shiftOut only)"],
          ]}
        />
      </Section>

      <Section title="Driving a 74HC595">
        <p className="text-sm leading-relaxed">
          The 74HC595 takes eight serial bits and latches them onto
          eight parallel output pins. You pulse a third pin — the
          latch — HIGH after shifting to make the new byte appear
          on the outputs all at once.
        </p>

        <CodeBlock code={`const int DATA_PIN  = 11;
const int CLOCK_PIN = 12;
const int LATCH_PIN = 8;

void sendByte(byte value) {
  digitalWrite(LATCH_PIN, LOW);
  shiftOut(DATA_PIN, CLOCK_PIN, MSBFIRST, value);
  digitalWrite(LATCH_PIN, HIGH);
}

void setup() {
  pinMode(DATA_PIN, OUTPUT);
  pinMode(CLOCK_PIN, OUTPUT);
  pinMode(LATCH_PIN, OUTPUT);
  sendByte(0b10101010);
}`} />

        <Note>
          <code>shiftOut</code> is a software-bit-bang, not SPI
          hardware — it works on any pair of digital pins but runs
          much slower than the hardware SPI bus on D11–D13.
        </Note>

        <Figure caption="shiftOut walks MSB→LSB: data is set, then the clock pulses HIGH to latch each bit into the receiver.">
          <ShiftOutTimingDiagram />
        </Figure>
      </Section>

      <SeeAlso
        refs={[
          "programming/bit-manipulation",
          "programming/digital-io",
          "board/spi",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── shiftOut timing diagram ────────────────────────────────────────────

function ShiftOutTimingDiagram() {
  const w = 580
  const h = 240
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const leftX = 80
  const trackW = 480
  const hi = 60
  const lo = 100
  const clkHi = 140
  const clkLo = 180
  const bits = [1, 0, 1, 0, 1, 0, 1, 0] // 0b10101010, MSB first
  const bitW = trackW / bits.length

  // Data waveform
  const dataPts: string[] = []
  let curY = bits[0] ? hi : lo
  dataPts.push(`${leftX},${curY}`)
  for (let i = 0; i < bits.length; i++) {
    const xStart = leftX + i * bitW
    const xEnd = leftX + (i + 1) * bitW
    const y = bits[i] ? hi : lo
    if (y !== curY) {
      dataPts.push(`${xStart},${curY}`)
      dataPts.push(`${xStart},${y}`)
      curY = y
    }
    dataPts.push(`${xEnd},${y}`)
  }

  // Clock waveform — pulse HIGH in the middle of each bit
  const clkPts: string[] = []
  clkPts.push(`${leftX},${clkLo}`)
  for (let i = 0; i < bits.length; i++) {
    const xStart = leftX + i * bitW
    const mid = xStart + bitW / 4
    const end = xStart + (3 * bitW) / 4
    clkPts.push(`${mid},${clkLo}`)
    clkPts.push(`${mid},${clkHi}`)
    clkPts.push(`${end},${clkHi}`)
    clkPts.push(`${end},${clkLo}`)
  }
  clkPts.push(`${leftX + trackW},${clkLo}`)

  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Labels */}
        <text x={leftX - 10} y={hi + 4} textAnchor="end" fontSize={11} fill="#60a5fa" fontFamily={mono}>DATA</text>
        <text x={leftX - 10} y={clkHi + 4} textAnchor="end" fontSize={11} fill="#10b981" fontFamily={mono}>CLOCK</text>

        {/* Waveforms */}
        <polyline points={dataPts.join(" ")} fill="none" stroke="#60a5fa" strokeWidth={2} />
        <polyline points={clkPts.join(" ")} fill="none" stroke="#10b981" strokeWidth={2} />

        {/* Bit labels */}
        {bits.map((b, i) => (
          <text
            key={i}
            x={leftX + i * bitW + bitW / 2}
            y={35}
            textAnchor="middle"
            fontSize={11}
            fill="#d1d5db"
            fontFamily={mono}
          >
            {b}
          </text>
        ))}

        {/* Bit range header */}
        <text x={leftX + trackW / 2} y={18} textAnchor="middle" fontSize={10} fill="#a78bfa" fontFamily={mono}>
          0b10101010, MSBFIRST
        </text>

        {/* Sample arrows */}
        <text x={leftX + trackW / 2} y={220} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily={mono}>
          receiver latches the DATA line on each CLOCK rising edge
        </text>
      </svg>
    </div>
  )
}

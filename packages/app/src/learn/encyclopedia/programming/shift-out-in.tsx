// Arduino Programming > Arduino API > shiftOut and shiftIn

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  Table,
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

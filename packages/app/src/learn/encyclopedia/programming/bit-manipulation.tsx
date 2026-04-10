// Arduino Programming > Arduino API > Bit manipulation

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

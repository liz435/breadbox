// Arduino Programming > Arduino API > EEPROM

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

export function EepromPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "eeprom",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="EEPROM"
        subtitle="A kilobyte of non-volatile memory that survives resets and power cycles."
      />

      <Section title="A tiny disk">
        <p className="text-sm leading-relaxed">
          The ATmega328P has 1 KB of <Term k="eeprom" /> — a block
          of non-volatile memory separate from the flash that holds
          your sketch. Anything you write there stays there when the
          board loses power, so it's the right place for
          configuration, calibration, or a counter that survives a
          reset. Include the library, then use byte-at-a-time
          reads and writes.
        </p>
      </Section>

      <Section title="The four functions you need">
        <Table
          headers={["Call", "What it does"]}
          rows={[
            ["EEPROM.read(address)", "Return the byte at that address"],
            ["EEPROM.write(address, value)", "Write the byte unconditionally"],
            [
              "EEPROM.update(address, value)",
              "Write only if the current byte differs",
            ],
            [
              "EEPROM.length()",
              "Size in bytes — 1024 on the Uno",
            ],
          ]}
        />
      </Section>

      <Section title="A boot counter">
        <CodeBlock code={`#include <EEPROM.h>

const int COUNTER_ADDR = 0;

void setup() {
  Serial.begin(9600);
  byte count = EEPROM.read(COUNTER_ADDR);
  count = count + 1;
  EEPROM.update(COUNTER_ADDR, count);
  Serial.print("Boot #");
  Serial.println(count);
}

void loop() {
}`} />

        <p className="text-sm leading-relaxed">
          Every reset advances the counter by one and prints it.
          Because a byte wraps at 255, this particular sketch
          resets back to zero on the 256th boot — for a bigger
          counter, spread it across multiple addresses.
        </p>
      </Section>

      <Section title="Write endurance">
        <p className="text-sm leading-relaxed">
          Each EEPROM cell is rated for roughly 100,000 write
          cycles. That's plenty for saving a user setting
          occasionally, but a sketch that writes every
          <code>loop()</code> iteration will wear a cell out in
          hours. Prefer <code>EEPROM.update()</code> over{" "}
          <code>write()</code> so unchanged bytes don't consume a
          cycle, and only save when the value actually changes.
        </p>

        <Warn>
          Dreamer's simulator does not persist EEPROM across
          reloads — treat it as a volatile scratch space in the
          editor. On a real Uno, it survives everything except a
          chip erase.
        </Warn>

        <Note>
          To store a multi-byte value (an <code>int</code> or a
          <code>long</code>), split it across consecutive
          addresses yourself — e.g. write the low byte to address
          0 and the high byte to address 1.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/atmega328p",
          "programming/variables",
          "programming/bit-manipulation",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

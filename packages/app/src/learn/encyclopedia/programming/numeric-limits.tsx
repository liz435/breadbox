// Arduino Programming > C++ essentials > Numeric limits and overflow

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

export function NumericLimitsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "numeric-limits",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Numeric limits and overflow"
        subtitle="Every type has a ceiling. Pass it, and the number silently wraps around."
      />

      <Section title="The AVR type ranges">
        <p className="text-sm leading-relaxed">
          On the Uno's AVR chip, <code className="text-gray-200">int</code>{" "}
          is only 16 bits — half the size of{" "}
          <code className="text-gray-200">int</code> on your laptop.
          That's small enough that everyday counters can actually run
          out of room, so it's worth knowing the numbers:
        </p>

        <Table
          headers={["Type", "Size", "Range"]}
          rows={[
            ["byte / uint8_t", "1 byte", "0 to 255"],
            ["char / int8_t", "1 byte", "−128 to 127"],
            ["int / int16_t", "2 bytes", "−32,768 to 32,767"],
            ["unsigned int / uint16_t", "2 bytes", "0 to 65,535"],
            ["long / int32_t", "4 bytes", "−2,147,483,648 to 2,147,483,647"],
            ["unsigned long / uint32_t", "4 bytes", "0 to 4,294,967,295"],
          ]}
        />
      </Section>

      <Section title="Overflow wraps silently">
        <p className="text-sm leading-relaxed">
          When a signed integer passes its maximum, C++ doesn't throw
          an error — it rolls over to the minimum. An{" "}
          <code>unsigned int</code> that hits its max rolls back to 0.
          Either way the sketch keeps running with wrong numbers.
        </p>

        <CodeBlock code={`int i = 32767;
i++;
// i is now -32768, not 32768

unsigned int u = 65535;
u++;
// u is now 0`} />
      </Section>

      <Section title="The classic millis() rollover">
        <p className="text-sm leading-relaxed">
          <code className="text-gray-200">millis()</code> returns an{" "}
          <code>unsigned long</code>. It counts up from zero and rolls
          back to zero after about 49.7 days. Sketches that compare
          timestamps with subtraction —{" "}
          <code>millis() - lastTime &gt;= interval</code> — keep working
          across the rollover because unsigned subtraction gives the
          right answer even when it wraps. Sketches that compare with
          less-than — <code>millis() &lt; deadline</code> — break.
        </p>

        <Note>
          Always store timestamps from <code>millis()</code> in an{" "}
          <code>unsigned long</code>, and always compare elapsed time
          with subtraction, not by checking whether{" "}
          <code>millis()</code> has passed a specific value.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/variables",
          "programming/timing",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

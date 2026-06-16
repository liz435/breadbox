// Arduino Programming > C++ essentials > Numeric limits and overflow

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  CodeBlock,
  Figure,
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
          On the Uno's AVR chip, <code className="text-foreground">int</code>{" "}
          is only 16 bits — half the size of{" "}
          <code className="text-foreground">int</code> on your laptop.
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

        <Figure caption="Adding 1 to the max of an int16 wraps around to the minimum — the number line closes into a loop.">
          <OverflowDiagram />
        </Figure>
      </Section>

      <Section title="The classic millis() rollover">
        <p className="text-sm leading-relaxed">
          <code className="text-foreground">millis()</code> returns an{" "}
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

// ── Overflow number-line diagram ───────────────────────────────────────

function OverflowDiagram() {
  const w = 520
  const h = 180
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Main line */}
        <line x1={40} y1={90} x2={480} y2={90} stroke="#60a5fa" strokeWidth={2} />
        {/* Endpoints */}
        <line x1={40} y1={80} x2={40} y2={100} stroke="#60a5fa" strokeWidth={2} />
        <line x1={480} y1={80} x2={480} y2={100} stroke="#60a5fa" strokeWidth={2} />
        <line x1={260} y1={85} x2={260} y2={95} stroke="#9ca3af" strokeWidth={1.5} />

        {/* Labels */}
        <text x={40} y={120} textAnchor="middle" fontSize={11} fill="#ef4444" fontFamily={mono}>−32768</text>
        <text x={40} y={135} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>INT16_MIN</text>
        <text x={260} y={120} textAnchor="middle" fontSize={11} fill="#d1d5db" fontFamily={mono}>0</text>
        <text x={480} y={120} textAnchor="middle" fontSize={11} fill="#10b981" fontFamily={mono}>32767</text>
        <text x={480} y={135} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>INT16_MAX</text>

        {/* Overflow arrow wrapping around */}
        <path
          d="M 480 80 Q 480 30 260 30 Q 40 30 40 80"
          fill="none"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="5,3"
        />
        <polyline points="35,75 40,80 45,75" fill="none" stroke="#f59e0b" strokeWidth={2} />
        <text x={260} y={20} textAnchor="middle" fontSize={11} fill="#f59e0b" fontFamily={mono}>overflow: i++ wraps</text>

        {/* Bottom caption */}
        <text x={w / 2} y={165} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily={mono}>
          int16 = 2 bytes = 65,536 values on a closed ring
        </text>
      </svg>
    </div>
  )
}

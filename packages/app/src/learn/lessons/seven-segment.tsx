import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function SevenSegmentLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="7-Segment Counter"
        subtitle="Count 0–9 by driving individual LED segments directly from the sketch."
      
        badge={<DifficultyBadge difficulty="intermediate" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A common-cathode 7-segment display whose seven segments (a–g) connect to pins
          2–8 through 220{"\u03a9"} <Term k="resistor">resistors</Term>. The sketch uses a
          lookup table of byte patterns to display the digits 0 through 9, stepping through
          them once per second.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="14-seven-segment" panels={["code", "schematic"]} height={520} />
        <Note>
          Press <strong>Play</strong>. The display counts from 0 to 9, then wraps back
          to 0. The Schematic panel shows which segment maps to which pin.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          A 7-segment display is seven individual{" "}
          <Term k="led">LEDs</Term> arranged in an "8" shape, labeled a through g. The
          sketch stores a <Term k="array">byte array</Term> called{" "}
          <code className="text-gray-200">digits[]</code> where each entry encodes which
          segments to light for that digit. For example, the digit "1" lights segments b
          and c, so its byte is <code className="text-gray-200">0x06</code> (bits 1 and
          2 set).
        </p>
        <p className="text-sm leading-relaxed">
          The helper function <code className="text-gray-200">showDigit(d)</code> loops
          through all 7 segment pins and uses bitwise AND to extract each bit from the
          pattern byte, then writes that bit to the corresponding pin. One for-loop, seven
          <code className="text-gray-200"> digitalWrite()</code> calls per digit update.
        </p>
      </Section>

      <Section title="Common-cathode vs common-anode">
        <p className="text-sm leading-relaxed">
          This display is <em>common-cathode</em>: all seven LED cathodes share a single
          GND pin. Writing HIGH to a segment pin lights that segment. A
          common-anode display is the opposite — all anodes share VCC, and you write LOW
          to light a segment. The same sketch on a common-anode display would show the
          complement of every digit. Check your display's datasheet before wiring.
        </p>
      </Section>

      <LessonFooter currentSlug="seven-segment" />
    </LearnLayout>
  )
}

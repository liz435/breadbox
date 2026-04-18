import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function Lcd16x2Lesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="LCD Hello World"
        subtitle="Print text and a running timer on a 16x2 character LCD."
      
        badge={<DifficultyBadge difficulty="intermediate" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A 16-column, 2-row character LCD driven in 4-bit parallel mode. The top row
          displays "Hello, World!" and the bottom row shows an elapsed-time counter
          that updates every half second. No extra hardware is needed beyond the display
          and the <code className="text-gray-200">LiquidCrystal</code> library.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="15-lcd-16x2" panels={["code"]} height={500} />
        <Note>
          Press <strong>Play</strong>. "Hello, World!" appears on line 1 and a seconds
          counter ticks on line 2.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          The{" "}
          <code className="text-gray-200">LiquidCrystal lcd(12, 11, 5, 4, 3, 2)</code>{" "}
          constructor maps six Arduino pins to the LCD's RS, Enable, and four data lines
          (D4–D7). In 4-bit mode the library sends each byte as two 4-bit nibbles, which
          frees up four of the eight data pins for other uses.
        </p>
        <p className="text-sm leading-relaxed">
          <code className="text-gray-200">lcd.begin(16, 2)</code> initializes the display
          for 16 columns and 2 rows. After that,{" "}
          <code className="text-gray-200">lcd.print()</code> writes characters starting
          at the current cursor position, and{" "}
          <code className="text-gray-200">lcd.setCursor(col, row)</code> moves the cursor
          before the next print — the same way a typewriter returns to a specific position.
        </p>
      </Section>

      <Section title="Why does the counter need trailing spaces?">
        <p className="text-sm leading-relaxed">
          The LCD never erases characters on its own — it only overwrites whatever is in
          a cell when you write to it. If the counter goes from "10s" to "9s", the digit
          "0" from "10" would remain. The sketch appends{" "}
          <code className="text-gray-200">"s  "</code> (two trailing spaces) to overwrite
          any leftover digits from wider previous values without clearing the whole line.
        </p>
      </Section>

      <LessonFooter currentSlug="lcd-16x2" />
    </LearnLayout>
  )
}

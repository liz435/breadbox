// Arduino Programming > Libraries > LiquidCrystal library

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function LiquidCrystalLibraryPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "liquidcrystal-library",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="LiquidCrystal library"
        subtitle="Driving 16×2 and 20×4 character LCDs over the parallel HD44780 bus."
      />

      <Section title="Construct and begin">
        <p className="text-sm leading-relaxed">
          The stock <code className="text-gray-200">LiquidCrystal</code>{" "}
          library ships with the Arduino IDE and talks to the almost-
          universal HD44780 character LCD in 4-bit mode. You pass the
          six pin numbers to the constructor, then tell the library
          how many columns and rows your display has.
        </p>

        <CodeBlock code={`#include <LiquidCrystal.h>

// LiquidCrystal lcd(rs, en, d4, d5, d6, d7);
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

void setup() {
  lcd.begin(16, 2);    // 16 columns, 2 rows
  lcd.print("Hello, world!");
}

void loop() {}`} />
      </Section>

      <Section title="Moving the cursor and printing">
        <p className="text-sm leading-relaxed">
          <code className="text-gray-200">setCursor(col, row)</code>{" "}
          positions the next character. Both arguments are zero-based —
          the top-left is <code>(0, 0)</code>.{" "}
          <code className="text-gray-200">print()</code> writes any
          value <code>Serial.print()</code> could handle, and{" "}
          <code className="text-gray-200">clear()</code> wipes the
          screen and returns the cursor to the top-left.
        </p>

        <CodeBlock code={`void loop() {
  lcd.setCursor(0, 1);          // second row
  lcd.print("t=");
  lcd.print(millis() / 1000);
  lcd.print("s  ");             // trailing spaces erase old digits
  delay(250);
}`} />

        <Note>
          The LCD doesn't blank old characters when you overwrite the
          cursor — a shorter number will leave the previous digits
          behind. Either pad with trailing spaces, or call{" "}
          <code>lcd.clear()</code> between frames.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/serial-api",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

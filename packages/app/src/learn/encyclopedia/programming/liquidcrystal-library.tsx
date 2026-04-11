// Arduino Programming > Libraries > LiquidCrystal library

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  Figure,
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

        <Figure caption="16×2 LCD wired to the Arduino with six data lines (RS, E, D4–D7) plus 5V and GND.">
          <LcdWiringDiagram />
        </Figure>
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

// ── LCD wiring diagram ─────────────────────────────────────────────────

function LcdWiringDiagram() {
  const w = 560
  const h = 320
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const pins = [
    { name: "RS", arduino: "D12", y: 70 },
    { name: "E", arduino: "D11", y: 100 },
    { name: "D4", arduino: "D5", y: 140 },
    { name: "D5", arduino: "D4", y: 170 },
    { name: "D6", arduino: "D3", y: 200 },
    { name: "D7", arduino: "D2", y: 230 },
  ]
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* LCD box */}
        <rect x={340} y={40} width={200} height={230} rx={6} fill="#0f0f0f" stroke="#60a5fa" strokeWidth={2} />
        <text x={440} y={60} textAnchor="middle" fontSize={11} fill="#60a5fa" fontFamily={mono}>16 × 2 LCD</text>
        {/* Screen area */}
        <rect x={360} y={75} width={160} height={50} fill="#0f0f0f" stroke="#10b981" strokeWidth={1.5} />
        <text x={440} y={105} textAnchor="middle" fontSize={12} fill="#10b981" fontFamily={mono}>Hello, world!</text>

        {/* Arduino box */}
        <rect x={20} y={40} width={140} height={230} rx={6} fill="#0f0f0f" stroke="#a78bfa" strokeWidth={2} />
        <text x={90} y={60} textAnchor="middle" fontSize={11} fill="#a78bfa" fontFamily={mono}>Arduino Uno</text>

        {/* Pin wires */}
        {pins.map((p) => (
          <g key={p.name}>
            <text x={155} y={p.y + 4} textAnchor="start" fontSize={10} fill="#9ca3af" fontFamily={mono}>{p.arduino}</text>
            <line x1={160} y1={p.y} x2={200} y2={p.y} stroke="#f59e0b" strokeWidth={1.5} />
            <line x1={200} y1={p.y} x2={340} y2={p.y} stroke="#f59e0b" strokeWidth={1.5} />
            <text x={335} y={p.y - 3} textAnchor="end" fontSize={10} fill="#f59e0b" fontFamily={mono}>{p.name}</text>
          </g>
        ))}

        {/* Power lines */}
        <text x={155} y={270} textAnchor="start" fontSize={10} fill="#ef4444" fontFamily={mono}>5V</text>
        <line x1={160} y1={266} x2={340} y2={266} stroke="#ef4444" strokeWidth={1.5} />
        <text x={335} y={263} textAnchor="end" fontSize={10} fill="#ef4444" fontFamily={mono}>VCC</text>

        <text x={155} y={300} textAnchor="start" fontSize={10} fill="#9ca3af" fontFamily={mono}>GND</text>
        <line x1={160} y1={296} x2={340} y2={296} stroke="#9ca3af" strokeWidth={1.5} />
        <text x={335} y={293} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily={mono}>GND</text>
      </svg>
    </div>
  )
}

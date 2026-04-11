// Arduino Programming > C++ essentials > Arrays

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
import { Term } from "../../term"

export function ArraysPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "arrays",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Arrays"
        subtitle="Fixed-size lists of values — the cleanest way to manage multiple pins or LEDs."
      />

      <Section title="Declaring an array">
        <p className="text-sm leading-relaxed">
          An <Term k="array">array</Term> is a fixed-size, ordered list
          of values that all share the same type. You declare it by
          writing the type, a name, square brackets with the size, and
          optionally an initializer list inside braces.
        </p>

        <CodeBlock code={`int ledPins[] = {9, 10, 11};
const int NUM_LEDS = 3;`} />

        <p className="text-sm leading-relaxed">
          When you use an initializer list, the compiler counts the
          elements for you, so you can leave the brackets empty.
        </p>
      </Section>

      <Section title="Indexing from zero">
        <p className="text-sm leading-relaxed">
          Array elements are numbered starting from{" "}
          <em className="text-gray-200">0</em>, not 1. The last valid
          index is always <code className="text-gray-200">length − 1</code>
          . Reading or writing past the end is a classic bug — C++ will
          happily clobber whatever memory is next door.
        </p>

        <CodeBlock code={`int first = ledPins[0];   // 9
int last  = ledPins[2];   // 11
// ledPins[3] — undefined behavior, do not touch`} />

        <Figure caption="An 8-element array laid out in memory — indices run 0..7, and array[3] is the fourth cell.">
          <ArrayLayoutDiagram />
        </Figure>
      </Section>

      <Section title="Iterating with a for loop">
        <p className="text-sm leading-relaxed">
          The reason arrays exist is so you can treat a group of things
          uniformly. A <code className="text-gray-200">for</code> loop
          walks the indices, letting one block of code cover every
          element:
        </p>

        <CodeBlock code={`const int ledPins[] = {9, 10, 11};
const int NUM_LEDS = 3;

void setup() {
  for (int i = 0; i < NUM_LEDS; i++) {
    pinMode(ledPins[i], OUTPUT);
  }
}

void loop() {
  for (int i = 0; i < NUM_LEDS; i++) {
    digitalWrite(ledPins[i], HIGH);
    delay(200);
    digitalWrite(ledPins[i], LOW);
  }
}`} />

        <Note>
          Store the length in a <code>const int</code> next to the array
          so the <code>for</code> loop never falls out of sync with the
          initializer list.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/control-flow",
          "programming/variables",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Array layout diagram ───────────────────────────────────────────────

function ArrayLayoutDiagram() {
  const w = 520
  const h = 160
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const cellW = 50
  const cellH = 44
  const startX = 40
  const startY = 50
  const values = [12, 7, 3, 42, 9, 15, 6, 21]
  const highlight = 3
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        <text x={w / 2} y={25} textAnchor="middle" fontSize={11} fill="#9ca3af" fontFamily={mono}>int data[8]</text>
        {values.map((v, i) => {
          const x = startX + i * cellW
          const isH = i === highlight
          return (
            <g key={i}>
              <rect
                x={x}
                y={startY}
                width={cellW}
                height={cellH}
                fill={isH ? "#0f0f0f" : "#0f0f0f"}
                stroke={isH ? "#f59e0b" : "#60a5fa"}
                strokeWidth={isH ? 2.5 : 1.5}
              />
              <text
                x={x + cellW / 2}
                y={startY + cellH / 2 + 5}
                textAnchor="middle"
                fontSize={14}
                fill={isH ? "#f59e0b" : "#d1d5db"}
                fontFamily={mono}
              >
                {v}
              </text>
              <text
                x={x + cellW / 2}
                y={startY + cellH + 16}
                textAnchor="middle"
                fontSize={11}
                fill="#9ca3af"
                fontFamily={mono}
              >
                {i}
              </text>
            </g>
          )
        })}
        {/* Arrow to data[3] */}
        <text x={startX + highlight * cellW + cellW / 2} y={startY - 10} textAnchor="middle" fontSize={11} fill="#f59e0b" fontFamily={mono}>
          data[3]
        </text>
        <line
          x1={startX + highlight * cellW + cellW / 2}
          y1={startY - 6}
          x2={startX + highlight * cellW + cellW / 2}
          y2={startY - 1}
          stroke="#f59e0b"
          strokeWidth={1.5}
        />
        <polyline
          points={`${startX + highlight * cellW + cellW / 2 - 4},${startY - 5} ${startX + highlight * cellW + cellW / 2},${startY - 1} ${startX + highlight * cellW + cellW / 2 + 4},${startY - 5}`}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  )
}

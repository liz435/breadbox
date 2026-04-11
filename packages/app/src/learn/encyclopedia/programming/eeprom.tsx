// Arduino Programming > Arduino API > EEPROM

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  Table,
  Figure,
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

      <Figure caption="Each cell is a byte addressable from 0 to 1023. Address 0x20 is just one of them — it survives a power cycle.">
        <EepromGridDiagram />
      </Figure>

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

// ── EEPROM grid diagram ────────────────────────────────────────────────

function EepromGridDiagram() {
  const w = 540
  const h = 220
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const cols = 16
  const rows = 4
  const cellSize = 26
  const startX = 60
  const startY = 50
  const highlightIdx = 0x20
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        <text x={w / 2} y={25} textAnchor="middle" fontSize={11} fill="#a78bfa" fontFamily={mono}>EEPROM (1024 bytes shown as 64)</text>

        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const idx = r * cols + c
            const isH = idx === highlightIdx
            return (
              <g key={`${r}-${c}`}>
                <rect
                  x={startX + c * cellSize}
                  y={startY + r * cellSize}
                  width={cellSize - 1}
                  height={cellSize - 1}
                  fill="#0f0f0f"
                  stroke={isH ? "#f59e0b" : "#60a5fa"}
                  strokeWidth={isH ? 2.5 : 1}
                />
                {isH && (
                  <text
                    x={startX + c * cellSize + cellSize / 2}
                    y={startY + r * cellSize + cellSize / 2 + 4}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#f59e0b"
                    fontFamily={mono}
                  >
                    42
                  </text>
                )}
              </g>
            )
          }),
        )}

        {/* Ellipsis */}
        <text x={w / 2} y={startY + rows * cellSize + 25} textAnchor="middle" fontSize={12} fill="#6b7280" fontFamily={mono}>... 960 more bytes ...</text>

        {/* Highlight label */}
        <text x={startX + (highlightIdx % cols) * cellSize + cellSize / 2} y={startY - 8} textAnchor="middle" fontSize={10} fill="#f59e0b" fontFamily={mono}>0x20</text>
      </svg>
    </div>
  )
}

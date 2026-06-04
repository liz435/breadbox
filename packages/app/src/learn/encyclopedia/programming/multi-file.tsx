// Arduino Programming > C++ essentials > Multi-file sketches

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  Table,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function MultiFilePage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "multi-file",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Multi-file sketches"
        subtitle="How Arduino IDE tabs map to files, and the difference between quoted and angle-bracket includes."
      />

      <Figure caption="The main .ino pulls in header/source pairs via #include. Arrows point from importer to imported file.">
        <MultiFileTreeDiagram />
      </Figure>

      <Section title="Tabs are files">
        <p className="text-sm leading-relaxed">
          In the Arduino IDE, clicking the little triangle and
          picking "New Tab" adds a new file alongside your main{" "}
          <code>.ino</code>. Every <code>.ino</code> tab in the
          sketch folder is concatenated together at compile time,
          which means functions in one tab are visible from
          another without any extra wiring. Tabs named{" "}
          <code>.h</code> or <code>.cpp</code> are treated as normal
          C++ header and source files — you have to{" "}
          <code>#include</code> them to use their contents.
        </p>
      </Section>

      <Section title="Two flavours of include">
        <Table
          headers={["Form", "Where it looks", "Use for"]}
          rows={[
            [
              '#include "MyFile.h"',
              "Your sketch folder first",
              "Your own headers",
            ],
            [
              "#include <Library.h>",
              "Installed library paths only",
              "Third-party libraries",
            ],
          ]}
        />

        <p className="text-sm leading-relaxed">
          Quoted includes find files inside your sketch folder.
          Angle-bracket includes skip the sketch folder and go
          straight to the library search path. If you get that
          backwards, the compiler will often still find the file
          but the error messages get confusing, so stick to the
          convention.
        </p>

        <CodeBlock code={`// BlinkTwoLeds.ino
#include <Servo.h>       // installed library
#include "pins.h"         // file next to BlinkTwoLeds.ino

Servo arm;

void setup() {
  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  arm.attach(SERVO_PIN);
}`} />
      </Section>

      <Section title="What Breadbox supports">
        <p className="text-sm leading-relaxed">
          Breadbox's sketch editor is single-file today. You can't
          split a project across multiple tabs in the simulator, so
          user <code>#include "..."</code> directives are not
          supported. Angle-bracket <code>#include &lt;...&gt;</code>{" "}
          for the built-in libraries (Servo, LiquidCrystal,
          Adafruit_NeoPixel, DHT, IRremote, Adafruit_SSD1306, EEPROM)
          works fine.
        </p>

        <Note>
          Keep your Breadbox sketches single-file. When you move to a
          real Arduino IDE, splitting across tabs is a good
          refactor once one file passes a few hundred lines.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/breadbox-limits",
          "programming/sketch-structure",
          "programming/classes",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Multi-file tree diagram ────────────────────────────────────────────

function MultiFileTreeDiagram() {
  const w = 520
  const h = 260
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const file = (x: number, y: number, name: string, color: string) => (
    <g>
      <rect x={x} y={y} width={120} height={40} rx={4} fill="#0f0f0f" stroke={color} strokeWidth={2} />
      <text x={x + 60} y={y + 25} textAnchor="middle" fontSize={12} fill="#d1d5db" fontFamily={mono}>{name}</text>
    </g>
  )
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Root .ino */}
        {file(200, 20, "Sketch.ino", "#a78bfa")}

        {/* Lines to children */}
        <line x1={260} y1={60} x2={100} y2={130} stroke="#6b7280" strokeWidth={1.5} />
        <line x1={260} y1={60} x2={260} y2={130} stroke="#6b7280" strokeWidth={1.5} />
        <line x1={260} y1={60} x2={420} y2={130} stroke="#6b7280" strokeWidth={1.5} />
        <text x={170} y={100} fontSize={10} fill="#f59e0b" fontFamily={mono}>#include "pins.h"</text>
        <text x={335} y={100} fontSize={10} fill="#f59e0b" fontFamily={mono}>#include &lt;Servo.h&gt;</text>

        {/* Child files */}
        {file(40, 130, "pins.h", "#60a5fa")}
        {file(200, 130, "helpers.cpp", "#10b981")}
        {file(360, 130, "Servo.h", "#60a5fa")}

        {/* helpers.cpp links back up via helpers.h */}
        <line x1={260} y1={170} x2={260} y2={200} stroke="#6b7280" strokeWidth={1.5} strokeDasharray="3,2" />
        {file(200, 200, "helpers.h", "#60a5fa")}

        <text x={w / 2} y={h - 10} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily={mono}>
          quoted includes look in the sketch folder first; angle brackets look only in libraries
        </text>
      </svg>
    </div>
  )
}

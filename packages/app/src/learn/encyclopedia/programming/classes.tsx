// Arduino Programming > C++ essentials > Classes (read-only)

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function ClassesPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "classes",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Classes (read-only)"
        subtitle="You don't write your own classes in a Breadbox sketch — you use the ones the libraries ship with."
      />

      <Figure caption="A Servo object bundles state and exposes methods — you call them through the dot operator.">
        <ClassObjectDiagram />
      </Figure>

      <Section title="Using a library class">
        <p className="text-sm leading-relaxed">
          Most Arduino libraries hand you a class. You declare one
          instance as a global variable, call its methods with a
          dot, and that's the whole API. The <code>Servo</code>{" "}
          class is the classic example: create one per servo, call{" "}
          <code>attach</code> once in <code>setup()</code>, then
          call <code>write</code> whenever you want to move it.
        </p>

        <CodeBlock code={`#include <Servo.h>

Servo arm;

void setup() {
  arm.attach(9);
  arm.write(90);
}

void loop() {
  arm.write(0);
  delay(1000);
  arm.write(180);
  delay(1000);
}`} />
      </Section>

      <Section title="Constructors with arguments">
        <p className="text-sm leading-relaxed">
          Some library classes take arguments when you create them.
          You pass those arguments in parentheses right after the
          variable name. <code>LiquidCrystal</code> takes the pins
          it's wired to; <code>Adafruit_NeoPixel</code> takes the
          strip length, the data pin, and a colour-order flag.
        </p>

        <CodeBlock code={`#include <LiquidCrystal.h>
#include <Adafruit_NeoPixel.h>

LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
Adafruit_NeoPixel strip(16, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  lcd.begin(16, 2);
  strip.begin();
}`} />
      </Section>

      <Section title="What Breadbox does not support">
        <p className="text-sm leading-relaxed">
          You can use the library classes that ship with Breadbox,
          but you can't write your own. The transpiler rejects
          <code>class</code> declarations in sketch code. If you
          want to group related state, use a <code>struct</code>{" "}
          (see the structs page) and plain functions that take the
          struct as a parameter. That covers almost every case
          where a beginner reaches for a class.
        </p>

        <Warn>
          No <code>new</code>, no <code>malloc</code>, and no
          pointers — all three are rejected by Breadbox's transpiler.
          Library classes are always declared as globals, never
          dynamically allocated.
        </Warn>

        <Note>
          The supported library list grows over time. When in doubt,
          check the "What Breadbox can and can't run" page.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/servo-library",
          "programming/liquidcrystal-library",
          "programming/breadbox-limits",
          "programming/structs",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Class / object diagram ─────────────────────────────────────────────

function ClassObjectDiagram() {
  const w = 500
  const h = 240
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const methods = [
    { name: "attach(pin)", color: "#60a5fa" },
    { name: "write(angle)", color: "#10b981" },
    { name: "read()", color: "#a78bfa" },
    { name: "detach()", color: "#f59e0b" },
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
        {/* Object circle */}
        <circle cx={180} cy={120} r={70} fill="#0f0f0f" stroke="#a78bfa" strokeWidth={2.5} />
        <text x={180} y={110} textAnchor="middle" fontSize={16} fill="#d1d5db" fontFamily={mono}>Servo</text>
        <text x={180} y={130} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>arm</text>
        <text x={180} y={148} textAnchor="middle" fontSize={9} fill="#6b7280" fontFamily={mono}>(object)</text>

        {/* Methods radiating out */}
        {methods.map((m, i) => {
          const y = 50 + i * 42
          return (
            <g key={m.name}>
              <line x1={250} y1={120} x2={310} y2={y + 10} stroke={m.color} strokeWidth={1.5} />
              <polyline points={`${305},${y + 5} ${310},${y + 10} ${305},${y + 15}`} fill="none" stroke={m.color} strokeWidth={1.5} />
              <rect x={315} y={y - 5} width={155} height={26} rx={4} fill="#0f0f0f" stroke={m.color} strokeWidth={1.5} />
              <text x={325} y={y + 12} fontSize={11} fill="#d1d5db" fontFamily={mono}>arm.{m.name}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

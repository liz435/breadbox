// Arduino Programming > C++ essentials > Functions

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

export function FunctionsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "functions",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Functions"
        subtitle="Break a sketch into named, reusable chunks."
      />

      <Section title="Why use them?">
        <p className="text-sm leading-relaxed">
          When the same four lines show up twice in your sketch, pull them
          into a function. The sketch gets shorter, the name tells future-
          you what the block is for, and there's only one place to fix a
          bug. <code>setup()</code> and <code>loop()</code> are themselves
          functions — you just happen to be overriding ones the Arduino
          core already provides.
        </p>

        <Figure caption="A function is a black box: values flow in as arguments, one value flows out as the return.">
          <FunctionBoxDiagram />
        </Figure>
      </Section>

      <Section title="Declaring a function">
        <p className="text-sm leading-relaxed">
          A function declaration has four parts: return type, name,
          parameter list, and body.
        </p>

        <CodeBlock code={`// return type         name           parameters
int add(int a, int b) {
  return a + b;          // body
}

void blink(int pin, int ms) {
  digitalWrite(pin, HIGH);
  delay(ms);
  digitalWrite(pin, LOW);
  delay(ms);
}`} />
      </Section>

      <Section title="Calling a function">
        <CodeBlock code={`void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  blink(13, 200);        // blink pin 13 fast
  int sum = add(2, 3);   // sum is now 5
}`} />
      </Section>

      <Section title="Return values">
        <p className="text-sm leading-relaxed">
          The return type goes before the name. Use <code>void</code> for
          functions that don't return anything; any other type means the
          function must use a <code>return</code> statement to hand a value
          back to the caller.
        </p>

        <CodeBlock code={`bool isWarm(float celsius) {
  if (celsius > 25.0) return true;
  return false;
}`} />
      </Section>

      <Section title="Scope">
        <p className="text-sm leading-relaxed">
          Parameters and variables declared inside a function are{" "}
          <strong className="text-gray-200">local</strong> — they only
          exist while the function is running. Once it returns, they're
          gone. If you want a value to persist between calls, store it in
          a global variable or a <code>static</code> local.
        </p>

        <Note>
          Functions must be declared before they're called. If you want
          to write helper functions below <code>loop()</code>, add a
          prototype at the top of the file, or let Arduino's preprocessor
          handle it for you (it usually does).
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/sketch-structure",
          "programming/variables",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Function "black box" diagram ───────────────────────────────────────

function FunctionBoxDiagram() {
  const w = 440
  const h = 200
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
        {/* Function box */}
        <rect x={140} y={50} width={160} height={100} rx={6} fill="#0f0f0f" stroke="#60a5fa" strokeWidth={2} />
        <text x={220} y={90} textAnchor="middle" fontSize={13} fill="#d1d5db" fontFamily={mono}>add(a, b)</text>
        <text x={220} y={115} textAnchor="middle" fontSize={11} fill="#9ca3af" fontFamily={mono}>return a + b;</text>

        {/* Input arrows */}
        <text x={30} y={78} fontSize={11} fill="#10b981" fontFamily={mono}>a = 2</text>
        <line x1={80} y1={80} x2={135} y2={80} stroke="#10b981" strokeWidth={1.5} />
        <polyline points="130,75 135,80 130,85" fill="none" stroke="#10b981" strokeWidth={1.5} />

        <text x={30} y={128} fontSize={11} fill="#10b981" fontFamily={mono}>b = 3</text>
        <line x1={80} y1={130} x2={135} y2={130} stroke="#10b981" strokeWidth={1.5} />
        <polyline points="130,125 135,130 130,135" fill="none" stroke="#10b981" strokeWidth={1.5} />

        {/* Return arrow */}
        <line x1={300} y1={100} x2={380} y2={100} stroke="#a78bfa" strokeWidth={1.5} />
        <polyline points="375,95 380,100 375,105" fill="none" stroke="#a78bfa" strokeWidth={1.5} />
        <text x={385} y={98} fontSize={11} fill="#a78bfa" fontFamily={mono}>5</text>

        {/* Labels */}
        <text x={80} y={40} fontSize={10} fill="#6b7280" fontFamily={mono}>parameters</text>
        <text x={330} y={80} fontSize={10} fill="#6b7280" fontFamily={mono}>return</text>
        <text x={220} y={180} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily={mono}>body runs when called</text>
      </svg>
    </div>
  )
}

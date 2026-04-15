// Arduino Programming > C++ essentials > Constants and #define

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

export function ConstantsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "constants",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Constants and #define"
        subtitle="Why almost every good sketch starts with const int LED_PIN = 13."
      />

      <Section title="Give magic numbers a name">
        <p className="text-sm leading-relaxed">
          When a sketch is full of bare numbers — <code>13</code>,{" "}
          <code>220</code>, <code>500</code> — you (and future you) have
          to remember what they meant. Put them in a named constant at
          the top of the file and they become self-documenting:
        </p>

        <CodeBlock code={`// BAD
void setup() {
  pinMode(13, OUTPUT);
}
void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}

// GOOD
const int LED_PIN = 13;
const int BLINK_MS = 500;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}
void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(BLINK_MS);
  digitalWrite(LED_PIN, LOW);
  delay(BLINK_MS);
}`} />

        <Figure caption="Magic numbers hide intent — named constants make it obvious what a value means.">
          <MagicVsNamedDiagram />
        </Figure>
      </Section>

      <Section title="const int vs #define">
        <p className="text-sm leading-relaxed">
          You'll see both styles in the wild. They do almost the same
          thing, but <code>const int</code> is the modern, safer choice.
        </p>

        <CodeBlock code={`// Old style — text substitution by the preprocessor.
#define LED_PIN 13

// Modern style — a real, typed, scoped constant.
const int LED_PIN = 13;`} />

        <Note>
          <code>#define</code> has no type and no scope — the preprocessor
          just pastes the number wherever the name appears. That means a
          typo gets caught later and with a worse error. Prefer{" "}
          <code>const int</code> (or <code>constexpr int</code>) unless
          you're using a library that expects a <code>#define</code>.
        </Note>
      </Section>

      <Section title="Where to put them">
        <p className="text-sm leading-relaxed">
          Put constants at the very top of the sketch, above{" "}
          <code>setup()</code>, grouped by purpose. This gives anyone
          reading your sketch a one-stop tuning panel.
        </p>

        <CodeBlock code={`// Pin assignments
const int LED_PIN = 13;
const int BUTTON_PIN = 2;
const int SENSOR_PIN = A0;

// Tuning
const int BLINK_MS = 500;
const int DEBOUNCE_MS = 50;`} />
      </Section>

      <SeeAlso
        refs={[
          "programming/variables",
          "programming/sketch-structure",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Magic numbers vs named constants ───────────────────────────────────

function MagicVsNamedDiagram() {
  const w = 520
  const h = 170
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
        {/* Left side — magic number */}
        <text x={120} y={20} textAnchor="middle" fontSize={11} fill="#ef4444" fontFamily={mono}>before</text>
        <rect x={20} y={30} width={200} height={110} rx={4} fill="#0f0f0f" stroke="#ef4444" strokeWidth={1.5} />
        <text x={35} y={60} fontSize={12} fill="#d1d5db" fontFamily={mono}>digitalWrite(</text>
        <circle cx={148} cy={56} r={12} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="3,2" />
        <text x={148} y={60} textAnchor="middle" fontSize={12} fill="#ef4444" fontFamily={mono}>13</text>
        <text x={165} y={60} fontSize={12} fill="#d1d5db" fontFamily={mono}>, HIGH);</text>
        <text x={35} y={100} fontSize={10} fill="#9ca3af" fontFamily={mono}>delay(</text>
        <text x={75} y={100} fontSize={10} fill="#ef4444" fontFamily={mono}>500</text>
        <text x={100} y={100} fontSize={10} fill="#9ca3af" fontFamily={mono}>);</text>
        <text x={35} y={125} fontSize={9} fill="#6b7280" fontFamily={mono}>what is 13? what is 500?</text>

        {/* Right side — named */}
        <text x={390} y={20} textAnchor="middle" fontSize={11} fill="#10b981" fontFamily={mono}>after</text>
        <rect x={290} y={30} width={220} height={110} rx={4} fill="#0f0f0f" stroke="#10b981" strokeWidth={1.5} />
        <text x={305} y={60} fontSize={12} fill="#d1d5db" fontFamily={mono}>digitalWrite(</text>
        <rect x={395} y={45} width={60} height={18} fill="none" stroke="#10b981" strokeWidth={1.5} rx={2} />
        <text x={425} y={60} textAnchor="middle" fontSize={11} fill="#10b981" fontFamily={mono}>LED_PIN</text>
        <text x={458} y={60} fontSize={12} fill="#d1d5db" fontFamily={mono}>, HIGH);</text>
        <text x={305} y={100} fontSize={10} fill="#9ca3af" fontFamily={mono}>delay(</text>
        <text x={345} y={100} fontSize={10} fill="#10b981" fontFamily={mono}>BLINK_MS</text>
        <text x={400} y={100} fontSize={10} fill="#9ca3af" fontFamily={mono}>);</text>
        <text x={305} y={125} fontSize={9} fill="#6b7280" fontFamily={mono}>intent is obvious</text>
      </svg>
    </div>
  )
}

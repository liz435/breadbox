// Arduino Programming > Patterns > Naming pins with const and enum

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

export function PinNamingPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "pin-naming",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Naming pins with const and enum"
        subtitle="A sketch that starts with LED_PIN instead of 13 reads itself and rewires itself."
      />

      <Section title="The magic-number problem">
        <p className="text-sm leading-relaxed">
          <code>digitalWrite(13, HIGH)</code> works, but six months
          later neither you nor anyone else knows what's on pin 13.
          Move the LED to pin 9 and you now have to find and update
          every call site. The fix is a one-line rule: the first
          thing every sketch declares is a set of named constants
          for its pins.
        </p>

        <CodeBlock code={`const int LED_PIN    = 9;
const int BUTTON_PIN = 2;
const int BUZZER_PIN = 11;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
}`} />

        <Figure caption="Compare the same sketch with magic numbers vs named constants — the right-hand version documents itself.">
          <PinNamingBeforeAfterDiagram />
        </Figure>
      </Section>

      <Section title="const int vs #define vs enum">
        <Table
          headers={["Form", "Pros", "Cons"]}
          rows={[
            [
              "const int LED_PIN = 9;",
              "Typed, scoped, debuggable, works with the Arduino API",
              "Takes two bytes of flash per constant (not SRAM)",
            ],
            [
              "#define LED_PIN 9",
              "Zero bytes, classic Arduino examples",
              "Untyped text substitution, weird error messages",
            ],
            [
              "enum { LED_PIN = 9, BUTTON_PIN = 2 };",
              "Groups related constants, typed",
              "Less idiomatic for pin numbers",
            ],
          ]}
        />

        <p className="text-sm leading-relaxed">
          For a modern sketch, reach for <code>const int</code>{" "}
          first. The flash savings of <code>#define</code> only
          matter when you're genuinely out of space on a tight
          build, and at that point you have bigger problems than
          constant declarations.
        </p>
      </Section>

      <Section title="Grouping related states with enum">
        <p className="text-sm leading-relaxed">
          <code>enum</code> earns its keep for sets of mutually
          exclusive values — modes, directions, state machine
          states. When a variable can hold exactly one of a few
          named options, an <code>enum</code> makes that explicit
          and lets the compiler check the <code>switch</code>.
        </p>

        <CodeBlock code={`enum Mode { OFF, BLINK, FADE };
Mode mode = OFF;`} />

        <Note>
          Keep pin constants in <code>const int</code> and mode
          constants in <code>enum</code>. The two don't overlap.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/constants",
          "programming/variables",
          "programming/state-machines",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Pin naming before/after diagram ────────────────────────────────────

function PinNamingBeforeAfterDiagram() {
  const w = 580
  const h = 220
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
        {/* Before */}
        <text x={140} y={20} textAnchor="middle" fontSize={11} fill="#ef4444" fontFamily={mono}>before</text>
        <rect x={20} y={30} width={240} height={170} rx={4} fill="#0f0f0f" stroke="#ef4444" strokeWidth={1.5} />
        <text x={35} y={60} fontSize={11} fill="#d1d5db" fontFamily={mono}>pinMode(</text>
        <text x={100} y={60} fontSize={11} fill="#ef4444" fontFamily={mono}>9</text>
        <text x={110} y={60} fontSize={11} fill="#d1d5db" fontFamily={mono}>, OUTPUT);</text>
        <text x={245} y={60} fontSize={14} fill="#ef4444" fontFamily={mono}>?</text>

        <text x={35} y={90} fontSize={11} fill="#d1d5db" fontFamily={mono}>pinMode(</text>
        <text x={100} y={90} fontSize={11} fill="#ef4444" fontFamily={mono}>2</text>
        <text x={110} y={90} fontSize={11} fill="#d1d5db" fontFamily={mono}>, INPUT_PULLUP);</text>
        <text x={245} y={90} fontSize={14} fill="#ef4444" fontFamily={mono}>?</text>

        <text x={35} y={120} fontSize={11} fill="#d1d5db" fontFamily={mono}>digitalWrite(</text>
        <text x={125} y={120} fontSize={11} fill="#ef4444" fontFamily={mono}>9</text>
        <text x={135} y={120} fontSize={11} fill="#d1d5db" fontFamily={mono}>, HIGH);</text>
        <text x={245} y={120} fontSize={14} fill="#ef4444" fontFamily={mono}>?</text>

        <text x={35} y={160} fontSize={10} fill="#6b7280" fontFamily={mono}>what is 9?</text>
        <text x={35} y={175} fontSize={10} fill="#6b7280" fontFamily={mono}>what is 2?</text>
        <text x={35} y={190} fontSize={10} fill="#6b7280" fontFamily={mono}>rewire = find/replace</text>

        {/* After */}
        <text x={440} y={20} textAnchor="middle" fontSize={11} fill="#10b981" fontFamily={mono}>after</text>
        <rect x={310} y={30} width={255} height={170} rx={4} fill="#0f0f0f" stroke="#10b981" strokeWidth={1.5} />
        <text x={325} y={60} fontSize={11} fill="#d1d5db" fontFamily={mono}>pinMode(</text>
        <text x={390} y={60} fontSize={11} fill="#10b981" fontFamily={mono}>LED_PIN</text>
        <text x={440} y={60} fontSize={11} fill="#d1d5db" fontFamily={mono}>, OUTPUT);</text>

        <text x={325} y={90} fontSize={11} fill="#d1d5db" fontFamily={mono}>pinMode(</text>
        <text x={390} y={90} fontSize={11} fill="#10b981" fontFamily={mono}>BUTTON_PIN</text>
        <text x={455} y={90} fontSize={11} fill="#d1d5db" fontFamily={mono}>, PULLUP);</text>

        <text x={325} y={120} fontSize={11} fill="#d1d5db" fontFamily={mono}>digitalWrite(</text>
        <text x={415} y={120} fontSize={11} fill="#10b981" fontFamily={mono}>LED_PIN</text>
        <text x={465} y={120} fontSize={11} fill="#d1d5db" fontFamily={mono}>, HIGH);</text>

        <text x={325} y={160} fontSize={10} fill="#6b7280" fontFamily={mono}>self-documenting</text>
        <text x={325} y={175} fontSize={10} fill="#6b7280" fontFamily={mono}>rewire = change one line</text>
      </svg>
    </div>
  )
}

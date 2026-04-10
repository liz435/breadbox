// Arduino Programming > Patterns > Naming pins with const and enum

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  Table,
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

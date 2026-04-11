// Arduino Programming > Patterns > Debouncing inputs

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

export function DebouncePage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "debounce",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Debouncing inputs"
        subtitle="Why a single button press fires five events — and how to stop it."
      />

      <Section title="Mechanical contacts chatter">
        <p className="text-sm leading-relaxed">
          When you press a button, the metal contacts don't close in
          one clean motion. They slap together, bounce apart, slap
          again, and settle — typically over 1 to 5 milliseconds. An
          Arduino reading the pin at microsecond speed sees that
          chatter as several rapid HIGH/LOW transitions, not one.
        </p>

        <p className="text-sm leading-relaxed">
          The symptom: a "press once" action (toggle an LED, increment
          a counter) triggers two, three, or five times from a single
          physical press. That's bounce, and every mechanical switch
          does it.
        </p>

        <Figure caption="The raw pin chatters for a few ms after the press. The debounced output emits a single clean edge once things settle.">
          <DebounceWaveDiagram />
        </Figure>
      </Section>

      <Section title="The stable-for-N-ms pattern">
        <p className="text-sm leading-relaxed">
          The textbook fix is <Term k="debounce" />: track when the
          raw pin last changed, and only accept a new reading once the
          line has stayed stable for some threshold (typically 20–50
          ms — long enough to outlast the bounce, short enough to feel
          instant). It's the <code>millis()</code>-based non-blocking
          pattern applied to an input.
        </p>

        <CodeBlock code={`const int BUTTON_PIN = 2;
const unsigned long DEBOUNCE_MS = 30;

int lastRaw = HIGH;              // raw pin state last time we looked
int stable = HIGH;               // last value we believed
unsigned long lastChange = 0;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.begin(9600);
}

void loop() {
  int raw = digitalRead(BUTTON_PIN);
  if (raw != lastRaw) {
    lastChange = millis();       // the line just moved
    lastRaw = raw;
  }

  if (millis() - lastChange >= DEBOUNCE_MS && raw != stable) {
    stable = raw;
    if (stable == LOW) {         // LOW = pressed, because INPUT_PULLUP
      Serial.println("pressed");
    }
  }
}`} />

        <Note>
          Fire your action on the <em className="text-gray-200">edge</em>{" "}
          (when <code>stable</code> changes), not while it's LOW. Otherwise
          holding the button down counts as multiple presses.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/non-blocking-timing",
          "electronics/switches",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Debounce waveform diagram ──────────────────────────────────────────

function DebounceWaveDiagram() {
  const w = 560
  const h = 240
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const leftX = 80
  const rightX = 540
  const rawHi = 50
  const rawLo = 110
  const outHi = 160
  const outLo = 210
  // Raw signal: initially HIGH, bounces down/up around x=200, settles LOW at x=280
  const raw = [
    `${leftX},${rawHi}`,
    `200,${rawHi}`,
    `200,${rawLo}`,
    `215,${rawLo}`,
    `215,${rawHi}`,
    `228,${rawHi}`,
    `228,${rawLo}`,
    `240,${rawLo}`,
    `240,${rawHi}`,
    `252,${rawHi}`,
    `252,${rawLo}`,
    `${rightX},${rawLo}`,
  ]
  // Debounced: stays HIGH, then single transition to LOW at x=290
  const deb = [`${leftX},${outHi}`, `290,${outHi}`, `290,${outLo}`, `${rightX},${outLo}`]
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Rails */}
        <text x={leftX - 10} y={rawHi + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily={mono}>HI</text>
        <text x={leftX - 10} y={rawLo + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily={mono}>LO</text>

        {/* Raw */}
        <text x={leftX - 10} y={28} textAnchor="end" fontSize={11} fill="#ef4444" fontFamily={mono}>raw pin</text>
        <polyline points={raw.join(" ")} fill="none" stroke="#ef4444" strokeWidth={2} />
        {/* Bounce shade */}
        <rect x={200} y={40} width={80} height={80} fill="#ef4444" fillOpacity={0.08} />
        <text x={240} y={140} textAnchor="middle" fontSize={10} fill="#ef4444" fontFamily={mono}>~3 ms bounce</text>

        {/* Debounced */}
        <text x={leftX - 10} y={outHi + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily={mono}>HI</text>
        <text x={leftX - 10} y={outLo + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily={mono}>LO</text>
        <text x={leftX - 10} y={150} textAnchor="end" fontSize={11} fill="#10b981" fontFamily={mono}>stable</text>
        <polyline points={deb.join(" ")} fill="none" stroke="#10b981" strokeWidth={2.5} />
        <text x={300} y={235} fontSize={10} fill="#10b981" fontFamily={mono}>clean falling edge → "pressed"</text>
      </svg>
    </div>
  )
}

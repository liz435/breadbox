// Arduino Programming > Arduino API > Interrupts API

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

export function InterruptsApiPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "interrupts-api",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Interrupts API"
        subtitle="attachInterrupt lets a pin change call a function without waiting for loop()."
      />

      <Section title="The three functions">
        <p className="text-sm leading-relaxed">
          An interrupt lets the hardware call a function — the{" "}
          <em className="text-foreground">ISR</em>, or interrupt service
          routine — the instant a pin changes, regardless of what your
          sketch is doing. On the Uno, only pins 2 and 3 support
          external interrupts.
        </p>

        <CodeBlock code={`attachInterrupt(digitalPinToInterrupt(pin), handler, mode);
// mode: LOW, CHANGE, RISING, FALLING

detachInterrupt(digitalPinToInterrupt(pin));`} />

        <p className="text-sm leading-relaxed">
          Wrap the pin number in <code>digitalPinToInterrupt()</code>{" "}
          so the same code works on boards that number their interrupt
          lines differently.
        </p>
      </Section>

      <Section title="A button counter">
        <CodeBlock code={`const int BUTTON_PIN = 2;
volatile unsigned long presses = 0;

void onPress() {
  presses++;
}

void setup() {
  Serial.begin(9600);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  attachInterrupt(
    digitalPinToInterrupt(BUTTON_PIN),
    onPress,
    FALLING
  );
}

void loop() {
  Serial.println(presses);
  delay(500);
}`} />
      </Section>

      <Figure caption="When the pin fires, the main loop is suspended, the ISR runs, and then the loop picks up exactly where it left off.">
        <IsrTimelineDiagram />
      </Figure>

      <Section title="Rules of ISRs">
        <p className="text-sm leading-relaxed">
          Any variable an ISR and the main loop both touch{" "}
          <em className="text-foreground">must</em> be declared{" "}
          <code>volatile</code>, or the compiler may cache it in a
          register and miss updates. Keep ISRs short — no{" "}
          <code>delay()</code>, no <code>Serial.print()</code>, no
          long computations. Set a flag, increment a counter, and
          return; let <code>loop()</code> do the real work next time
          through.
        </p>

        <Warn>
          Inside an ISR, <code>millis()</code> still returns — but it
          won't increment, because the timer interrupt that updates
          it is blocked while your ISR is running. Keep ISRs
          microseconds, not milliseconds.
        </Warn>

        <Note>
          Mechanical buttons bounce. A <code>FALLING</code> interrupt
          on a raw button will fire several times per press. Debounce
          in software (a short lockout timestamp works) or use an RC
          filter.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/interrupts",
          "programming/non-blocking-timing",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── ISR preemption timeline ────────────────────────────────────────────

function IsrTimelineDiagram() {
  const w = 540
  const h = 220
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const leftX = 50
  const rightX = 510
  const mainY = 150
  const isrY = 70
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Main loop track */}
        <text x={leftX - 10} y={mainY + 4} textAnchor="end" fontSize={11} fill="#60a5fa" fontFamily={mono}>loop()</text>
        <line x1={leftX} y1={mainY} x2={250} y2={mainY} stroke="#60a5fa" strokeWidth={2.5} />
        <line x1={250} y1={mainY} x2={250} y2={mainY + 8} stroke="#6b7280" strokeWidth={1} strokeDasharray="2,2" />
        <line x1={350} y1={mainY} x2={350} y2={mainY + 8} stroke="#6b7280" strokeWidth={1} strokeDasharray="2,2" />
        <line x1={350} y1={mainY} x2={rightX} y2={mainY} stroke="#60a5fa" strokeWidth={2.5} />

        {/* ISR up-jump */}
        <line x1={250} y1={mainY} x2={250} y2={isrY} stroke="#ef4444" strokeWidth={1.8} />
        <polyline points="245,80 250,70 255,80" fill="none" stroke="#ef4444" strokeWidth={1.8} />
        <text x={leftX - 10} y={isrY + 4} textAnchor="end" fontSize={11} fill="#ef4444" fontFamily={mono}>ISR</text>
        <line x1={250} y1={isrY} x2={350} y2={isrY} stroke="#ef4444" strokeWidth={2.5} />
        <line x1={350} y1={isrY} x2={350} y2={mainY} stroke="#ef4444" strokeWidth={1.8} />
        <polyline points="345,140 350,150 355,140" fill="none" stroke="#ef4444" strokeWidth={1.8} />

        {/* ISR body */}
        <rect x={255} y={isrY - 12} width={90} height={24} rx={3} fill="#0f0f0f" stroke="#ef4444" strokeWidth={1.5} />
        <text x={300} y={isrY + 4} textAnchor="middle" fontSize={10} fill="#ef4444" fontFamily={mono}>onPress()</text>

        {/* Pin event */}
        <line x1={250} y1={mainY + 10} x2={250} y2={mainY + 30} stroke="#f59e0b" strokeWidth={1.5} />
        <polyline points="245,25 250,15 255,25" fill="none" stroke="#f59e0b" strokeWidth={1.5} />
        <text x={250} y={mainY + 45} textAnchor="middle" fontSize={9} fill="#f59e0b" fontFamily={mono}>pin 2 FALLING</text>

        {/* Time axis */}
        <text x={w / 2} y={200} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily={mono}>time →</text>
      </svg>
    </div>
  )
}

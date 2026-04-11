// Arduino Programming > Patterns > Finite state machines for UI flows

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

export function UiStateMachinesPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "ui-state-machines",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Finite state machines for UI flows"
        subtitle="Detecting single-press, double-press, and long-press from one button is a state machine problem."
      />

      <Figure caption="Three states with event- and timeout-driven transitions. Every branch eventually returns to IDLE.">
        <UiFsmDiagram />
      </Figure>

      <Section title="Beyond blinking">
        <p className="text-sm leading-relaxed">
          The traffic-light <Term k="state-machine" /> on the
          blinking-patterns page transitions on time. A UI state
          machine also transitions on <em>events</em> — the button
          going up or down — and on <em>timeouts</em>, so a long
          press is "stayed in the PRESSED state for more than
          600 ms". The machinery is the same: an{" "}
          <code>enum</code> of states, a timestamp, a single
          switch in <code>loop()</code>.
        </p>
      </Section>

      <Section title="Three gestures from one button">
        <CodeBlock code={`enum Btn { IDLE, PRESSED, WAIT_DOUBLE };

const int BUTTON_PIN = 2;
const unsigned long LONG_MS   = 600;
const unsigned long DOUBLE_MS = 250;

Btn state = IDLE;
unsigned long stateStart = 0;

void onSingle()  { /* single press */ }
void onDouble()  { /* double press */ }
void onLong()    { /* long press   */ }

void loop() {
  int raw = digitalRead(BUTTON_PIN);
  unsigned long now = millis();

  switch (state) {
    case IDLE:
      if (raw == LOW) {
        state = PRESSED;
        stateStart = now;
      }
      break;

    case PRESSED:
      if (raw == HIGH) {
        if (now - stateStart >= LONG_MS) {
          onLong();
          state = IDLE;
        } else {
          state = WAIT_DOUBLE;
          stateStart = now;
        }
      }
      break;

    case WAIT_DOUBLE:
      if (raw == LOW) {
        onDouble();
        state = IDLE;
      } else if (now - stateStart >= DOUBLE_MS) {
        onSingle();
        state = IDLE;
      }
      break;
  }
}`} />
      </Section>

      <Section title="Reading the transitions">
        <p className="text-sm leading-relaxed">
          <code>IDLE</code> waits for the button to go down and
          jumps to <code>PRESSED</code>. <code>PRESSED</code>{" "}
          waits for the button to come back up — if you held it
          long enough, that's a long press; otherwise it might
          still be the first half of a double-press, so move to
          <code>WAIT_DOUBLE</code>. <code>WAIT_DOUBLE</code>{" "}
          either sees a second press (double) or times out
          (single). Every branch has a transition; the machine
          can't get stuck.
        </p>

        <Note>
          Debouncing belongs either inside the raw read (see
          the debounce page) or as a short lockout inside
          <code>IDLE</code>. Without it, contact bounce can push
          you straight through <code>PRESSED</code> and back.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/state-machines",
          "programming/debounce",
          "programming/non-blocking-timing",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── UI FSM diagram ─────────────────────────────────────────────────────

function UiFsmDiagram() {
  const w = 560
  const h = 280
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const bubble = (cx: number, cy: number, label: string, color: string) => (
    <g>
      <circle cx={cx} cy={cy} r={46} fill="#0f0f0f" stroke={color} strokeWidth={2.5} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize={12} fill={color} fontFamily={mono}>{label}</text>
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
        {bubble(90, 140, "IDLE", "#60a5fa")}
        {bubble(280, 140, "PRESSED", "#a78bfa")}
        {bubble(470, 140, "WAIT_DBL", "#f59e0b")}

        {/* IDLE → PRESSED */}
        <path d="M 136 140 Q 210 90 234 140" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
        <polyline points="229,135 234,140 229,145" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
        <text x={185} y={80} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>press</text>

        {/* PRESSED → IDLE (long press) */}
        <path d="M 234 140 Q 160 210 136 140" fill="none" stroke="#ef4444" strokeWidth={1.5} />
        <polyline points="141,145 136,140 141,135" fill="none" stroke="#ef4444" strokeWidth={1.5} />
        <text x={185} y={215} textAnchor="middle" fontSize={10} fill="#ef4444" fontFamily={mono}>release + t≥600ms (long)</text>

        {/* PRESSED → WAIT_DOUBLE */}
        <path d="M 326 140 Q 400 90 424 140" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
        <polyline points="419,135 424,140 419,145" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
        <text x={375} y={80} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>release (short)</text>

        {/* WAIT_DOUBLE → IDLE (single timeout) */}
        <path d="M 470 186 Q 350 270 90 186" fill="none" stroke="#10b981" strokeWidth={1.5} />
        <polyline points="95,191 90,186 95,181" fill="none" stroke="#10b981" strokeWidth={1.5} />
        <text x={280} y={265} textAnchor="middle" fontSize={10} fill="#10b981" fontFamily={mono}>t≥250ms → single</text>

        {/* WAIT_DOUBLE → IDLE (second press → double) */}
        <path d="M 470 94 Q 280 30 90 94" fill="none" stroke="#a78bfa" strokeWidth={1.5} />
        <polyline points="95,99 90,94 95,89" fill="none" stroke="#a78bfa" strokeWidth={1.5} />
        <text x={280} y={25} textAnchor="middle" fontSize={10} fill="#a78bfa" fontFamily={mono}>press → double</text>
      </svg>
    </div>
  )
}

// Arduino Programming > Patterns > State machines for blinking patterns

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

export function StateMachinesPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "state-machines",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="State machines for blinking patterns"
        subtitle="When one blink period isn't enough, move from a timer to a list of named states."
      />

      <Figure caption="Three states, three timeouts. Each arrow is the transition that fires when its timer expires.">
        <TrafficStateDiagram />
      </Figure>

      <Section title="From one interval to many">
        <p className="text-sm leading-relaxed">
          The classic non-blocking blink has a single interval — LED
          on for 500 ms, off for 500 ms, repeat. A traffic light needs
          three: green for 3 seconds, yellow for 1, red for 3. A
          breathing pattern needs dozens. Trying to bolt all of this
          onto one <code>millis()</code> comparison gets ugly fast.
        </p>

        <p className="text-sm leading-relaxed">
          The fix is to promote the sketch to a{" "}
          <Term k="state-machine" />: the program is always in exactly
          one named state, and each state has its own behavior and
          its own timeout that triggers a jump to the next state.
        </p>
      </Section>

      <Section title="Traffic light in three states">
        <CodeBlock code={`enum Light { GREEN, YELLOW, RED };
Light state = GREEN;
unsigned long stateStart = 0;

const int GREEN_PIN  = 9;
const int YELLOW_PIN = 10;
const int RED_PIN    = 11;

void enter(Light next) {
  state = next;
  stateStart = millis();
  digitalWrite(GREEN_PIN,  state == GREEN);
  digitalWrite(YELLOW_PIN, state == YELLOW);
  digitalWrite(RED_PIN,    state == RED);
}

void setup() {
  pinMode(GREEN_PIN,  OUTPUT);
  pinMode(YELLOW_PIN, OUTPUT);
  pinMode(RED_PIN,    OUTPUT);
  enter(GREEN);
}

void loop() {
  unsigned long elapsed = millis() - stateStart;
  switch (state) {
    case GREEN:
      if (elapsed >= 3000) enter(YELLOW);
      break;
    case YELLOW:
      if (elapsed >= 1000) enter(RED);
      break;
    case RED:
      if (elapsed >= 3000) enter(GREEN);
      break;
  }
}`} />

        <Note>
          The key moves: an <code>enum</code> for the legal states, a
          timestamp for when the current state started, a helper that
          records both whenever the state changes, and a{" "}
          <code>switch</code> in <code>loop()</code> that decides when
          to transition. This scales to as many steps as you like
          without ever calling <code>delay()</code>.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/non-blocking-timing",
          "programming/control-flow",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Traffic light FSM diagram ──────────────────────────────────────────

function TrafficStateDiagram() {
  const w = 500
  const h = 260
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const bubble = (cx: number, cy: number, label: string, color: string) => (
    <g>
      <circle cx={cx} cy={cy} r={38} fill="#0f0f0f" stroke={color} strokeWidth={2.5} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize={13} fill={color} fontFamily={mono}>{label}</text>
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
        {/* 3 bubbles */}
        {bubble(100, 130, "GREEN", "#10b981")}
        {bubble(250, 130, "YELLOW", "#f59e0b")}
        {bubble(400, 130, "RED", "#ef4444")}

        {/* Arrows GREEN → YELLOW */}
        <path d="M 138 130 Q 175 85 212 130" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
        <polyline points="207,125 212,130 207,135" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
        <text x={175} y={78} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>3000 ms</text>

        {/* YELLOW → RED */}
        <path d="M 288 130 Q 325 85 362 130" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
        <polyline points="357,125 362,130 357,135" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
        <text x={325} y={78} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>1000 ms</text>

        {/* RED → GREEN (wrap back below) */}
        <path d="M 362 155 Q 250 230 138 155" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
        <polyline points="143,160 138,155 143,150" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
        <text x={250} y={220} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>3000 ms</text>

        {/* Title */}
        <text x={w / 2} y={30} textAnchor="middle" fontSize={11} fill="#a78bfa" fontFamily={mono}>traffic light FSM</text>
      </svg>
    </div>
  )
}

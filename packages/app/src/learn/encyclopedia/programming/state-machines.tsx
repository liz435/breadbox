// Arduino Programming > Patterns > State machines for blinking patterns

import { useState, useEffect, useRef } from "react"
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

      <Figure caption="Click 'Run' to watch the traffic light FSM cycle through its states. The active state is highlighted; the transition timer counts down inside it.">
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

// ── Animated traffic light FSM diagram ────────────────────────────────────

type TrafficLight = "GREEN" | "YELLOW" | "RED"

type StateConfig = {
  state: TrafficLight
  duration: number  // ms (scaled down for demo speed)
  color: string
  next: TrafficLight
}

const STATES: StateConfig[] = [
  { state: "GREEN",  duration: 3000, color: "#10b981", next: "YELLOW" },
  { state: "YELLOW", duration: 1000, color: "#f59e0b", next: "RED" },
  { state: "RED",    duration: 3000, color: "#ef4444", next: "GREEN" },
]

function getConfig(s: TrafficLight) {
  return STATES.find((c) => c.state === s)!
}

function TrafficStateDiagram() {
  const w = 500
  const h = 260
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"

  const [running, setRunning] = useState(false)
  const [activeState, setActiveState] = useState<TrafficLight>("GREEN")
  const [elapsed, setElapsed] = useState(0)

  const stateRef = useRef<TrafficLight>("GREEN")
  const startRef = useRef<number>(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!running) return

    startRef.current = performance.now()
    stateRef.current = activeState

    function tick(now: number) {
      const e = now - startRef.current
      const cfg = getConfig(stateRef.current)
      if (e >= cfg.duration) {
        stateRef.current = cfg.next
        startRef.current = now
        setActiveState(cfg.next)
        setElapsed(0)
      } else {
        setElapsed(e)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggle() {
    if (running) {
      cancelAnimationFrame(rafRef.current)
      setRunning(false)
    } else {
      setActiveState("GREEN")
      stateRef.current = "GREEN"
      setElapsed(0)
      setRunning(true)
    }
  }

  const POSITIONS: Record<TrafficLight, [number, number]> = {
    GREEN:  [100, 130],
    YELLOW: [250, 130],
    RED:    [400, 130],
  }

  const activeCfg = getConfig(activeState)
  const remaining = Math.max(0, activeCfg.duration - elapsed)
  const progress = elapsed / activeCfg.duration

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full overflow-auto rounded border border-neutral-800 bg-[#0f0f0f] px-4 py-3">
        <div className="flex justify-center">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            width={w}
            height={h}
            xmlns="http://www.w3.org/2000/svg"
            className="max-w-full"
            role="img"
            aria-label={`Traffic light FSM. Active state: ${activeState}, ${(remaining / 1000).toFixed(1)}s remaining`}
          >
            {/* Title */}
            <text x={w / 2} y={30} textAnchor="middle" fontSize={11} fill="#a78bfa" fontFamily={mono}>traffic light FSM</text>

            {/* Arrows — drawn before bubbles so they render behind */}
            {/* GREEN → YELLOW */}
            <path d="M 138 130 Q 175 85 212 130" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
            <polyline points="207,125 212,130 207,135" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
            <text x={175} y={78} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>3000 ms</text>

            {/* YELLOW → RED */}
            <path d="M 288 130 Q 325 85 362 130" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
            <polyline points="357,125 362,130 357,135" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
            <text x={325} y={78} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>1000 ms</text>

            {/* RED → GREEN */}
            <path d="M 362 155 Q 250 230 138 155" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
            <polyline points="143,160 138,155 143,150" fill="none" stroke="#9ca3af" strokeWidth={1.5} />
            <text x={250} y={220} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>3000 ms</text>

            {/* State bubbles */}
            {STATES.map(({ state, color }) => {
              const [cx, cy] = POSITIONS[state]
              const isActive = activeState === state
              const r = isActive ? 42 : 38

              return (
                <g key={state}>
                  {/* Progress arc drawn behind the circle when active */}
                  {isActive && running && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r + 6}
                      fill="none"
                      stroke={color}
                      strokeWidth={3}
                      strokeOpacity={0.3}
                      strokeDasharray={`${2 * Math.PI * (r + 6) * progress} ${2 * Math.PI * (r + 6)}`}
                      strokeDashoffset={0}
                      transform={`rotate(-90 ${cx} ${cy})`}
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={isActive ? `${color}1a` : "#0f0f0f"}
                    stroke={color}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  <text
                    x={cx}
                    y={cy + 5}
                    textAnchor="middle"
                    fontSize={13}
                    fill={color}
                    fontFamily={mono}
                  >
                    {state}
                  </text>
                  {isActive && running && (
                    <text
                      x={cx}
                      y={cy + 20}
                      textAnchor="middle"
                      fontSize={9}
                      fill={color}
                      fontFamily={mono}
                      fillOpacity={0.8}
                    >
                      {(remaining / 1000).toFixed(1)}s
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* Controls */}
      <button
        type="button"
        onClick={handleToggle}
        className="rounded-md border border-neutral-700 bg-neutral-800 px-4 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 transition-colors"
      >
        {running ? "Stop" : "Run FSM"}
      </button>
    </div>
  )
}

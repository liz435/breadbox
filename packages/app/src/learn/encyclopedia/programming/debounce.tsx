// Arduino Programming > Patterns > Debouncing inputs

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
import { cn } from "@/utils/classnames"

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

        <Figure caption="Press the button to see the raw pin chatter vs. the debounced output.">
          <DebounceInteractive />
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
          Fire your action on the <em className="text-foreground">edge</em>{" "}
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

// ── Interactive debounce demo ──────────────────────────────────────────────
//
// Simulates mechanical bounce on button press (using random bounce events),
// then shows the debounced stable output after the threshold settles.
// Respects prefers-reduced-motion — static diagram is shown instead.

type SignalEvent = { t: number; high: boolean }

const DEBOUNCE_MS = 30
const BOUNCE_DURATION = 8  // ms of simulated bounce window

/** Generate a sequence of raw bounce events for one press. */
function generateBounce(tPress: number): SignalEvent[] {
  const events: SignalEvent[] = [{ t: tPress, high: false }]
  let t = tPress
  for (let i = 0; i < 4; i++) {
    t += 1 + Math.random() * 1.5
    events.push({ t, high: true })
    t += 0.5 + Math.random() * 1.5
    events.push({ t, high: false })
  }
  return events
}

function DebounceInteractive() {
  const [prefersReduced, setPrefersReduced] = useState(false)
  const [events, setEvents] = useState<SignalEvent[]>([])
  const [debounced, setDebounced] = useState<SignalEvent[]>([])
  const [pressCount, setPressCount] = useState(0)
  const [stableCount, setStableCount] = useState(0)
  const [nowT, setNowT] = useState(0)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReduced(mq.matches)
    function onChange(e: MediaQueryListEvent) { setPrefersReduced(e.matches) }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  function handlePress() {
    const tPress = nowT || 10
    const bounceEvents = generateBounce(tPress)
    setEvents((prev) => [...prev, ...bounceEvents])
    setPressCount((c) => c + 1)

    // After DEBOUNCE_MS, emit one stable edge
    const stableT = bounceEvents.at(-1)!.t + DEBOUNCE_MS + 2
    setDebounced((prev) => [...prev, { t: stableT, high: false }])
    setStableCount((c) => c + 1)
  }

  // Animate a "now" cursor scrolling right
  useEffect(() => {
    if (prefersReduced) return
    startRef.current = performance.now()
    function tick(now: number) {
      setNowT(((now - startRef.current) / 1000) * 50) // 50 units/s
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [prefersReduced])

  if (prefersReduced) {
    return <StaticDebounceWave />
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded border border-border bg-[#0f0f0f] p-4">
      <DebounceWaveCanvas events={events} debounced={debounced} nowT={nowT} />

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={handlePress}
          className={cn(
            "rounded-md border border-border bg-secondary px-5 py-2 text-sm font-medium text-foreground",
            "hover:bg-muted active:scale-95 transition-all select-none",
          )}
        >
          Press button
        </button>
        <div className="text-xs space-y-0.5">
          <p className="text-red-400">Raw transitions: <span className="font-mono font-semibold">{pressCount * 5}</span></p>
          <p className="text-emerald-400">Stable edges: <span className="font-mono font-semibold">{stableCount}</span></p>
        </div>
      </div>
    </div>
  )
}

type WaveCanvasProps = {
  events: SignalEvent[]
  debounced: SignalEvent[]
  nowT: number
}

function DebounceWaveCanvas({ events, debounced, nowT }: WaveCanvasProps) {
  const w = 520
  const h = 200
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const viewStart = Math.max(0, nowT - 80)
  const viewEnd = viewStart + 100

  function tToX(t: number): number {
    return ((t - viewStart) / (viewEnd - viewStart)) * (w - 60) + 50
  }

  // Build raw signal polyline
  const rawHi = 40
  const rawLo = 90
  const outHi = 130
  const outLo = 180

  // Build raw points
  const rawPoints: [number, number][] = [[50, rawHi]]
  for (const ev of events) {
    const x = tToX(ev.t)
    if (x < 50 || x > w) continue
    const prevY = rawPoints.at(-1)?.[1] ?? rawHi
    rawPoints.push([x, prevY])
    rawPoints.push([x, ev.high ? rawHi : rawLo])
  }
  rawPoints.push([w, rawPoints.at(-1)?.[1] ?? rawHi])

  // Build debounced points
  const debPoints: [number, number][] = [[50, outHi]]
  for (const ev of debounced) {
    const x = tToX(ev.t)
    if (x < 50 || x > w) continue
    const prevY = debPoints.at(-1)?.[1] ?? outHi
    debPoints.push([x, prevY])
    debPoints.push([x, ev.high ? outHi : outLo])
  }
  debPoints.push([w, debPoints.at(-1)?.[1] ?? outHi])

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className="max-w-full"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Debounce waveform diagram showing raw pin chatter and the stable debounced output"
    >
      {/* Labels */}
      <text x={2} y={rawHi + 4} textAnchor="start" fontSize={10} fill="#ef4444" fontFamily={mono}>raw pin</text>
      <text x={2} y={outHi + 4} textAnchor="start" fontSize={10} fill="#10b981" fontFamily={mono}>stable</text>

      {/* Rails (dashed grid lines) */}
      {[rawHi, rawLo, outHi, outLo].map((y) => (
        <line key={y} x1={50} y1={y} x2={w} y2={y} stroke="#27272a" strokeWidth={1} strokeDasharray="3 3" />
      ))}

      {/* Raw waveform */}
      <polyline
        points={rawPoints.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="#ef4444"
        strokeWidth={2}
        strokeLinejoin="miter"
      />

      {/* Debounced waveform */}
      <polyline
        points={debPoints.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="#10b981"
        strokeWidth={2.5}
        strokeLinejoin="miter"
      />
    </svg>
  )
}

// Static fallback diagram for prefers-reduced-motion
function StaticDebounceWave() {
  const w = 560
  const h = 240
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const leftX = 80
  const rightX = 540
  const rawHi = 50
  const rawLo = 110
  const outHi = 160
  const outLo = 210
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
  const deb = [`${leftX},${outHi}`, `290,${outHi}`, `290,${outLo}`, `${rightX},${outLo}`]
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
        role="img"
        aria-label="Static debounce waveform: raw pin chatters for ~3ms then settles; debounced output shows a single clean falling edge after 30ms"
      >
        <text x={leftX - 10} y={rawHi + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily={mono}>HI</text>
        <text x={leftX - 10} y={rawLo + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily={mono}>LO</text>

        <text x={leftX - 10} y={28} textAnchor="end" fontSize={11} fill="#ef4444" fontFamily={mono}>raw pin</text>
        <polyline points={raw.join(" ")} fill="none" stroke="#ef4444" strokeWidth={2} />
        <rect x={200} y={40} width={80} height={80} fill="#ef4444" fillOpacity={0.08} />
        <text x={240} y={140} textAnchor="middle" fontSize={10} fill="#ef4444" fontFamily={mono}>~3 ms bounce</text>

        <text x={leftX - 10} y={outHi + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily={mono}>HI</text>
        <text x={leftX - 10} y={outLo + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily={mono}>LO</text>
        <text x={leftX - 10} y={150} textAnchor="end" fontSize={11} fill="#10b981" fontFamily={mono}>stable</text>
        <polyline points={deb.join(" ")} fill="none" stroke="#10b981" strokeWidth={2.5} />
        <text x={300} y={235} fontSize={10} fill="#10b981" fontFamily={mono}>clean falling edge → "pressed"</text>
      </svg>
    </div>
  )
}

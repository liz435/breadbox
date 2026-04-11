// Arduino Programming > Patterns > Reading multiple sensors without blocking

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

export function MultiSensorPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "multi-sensor",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Reading multiple sensors without blocking"
        subtitle="One loop(), several sensors — each with its own schedule built on millis()."
      />

      <Section title="Why schedules differ">
        <p className="text-sm leading-relaxed">
          A button needs to be polled every few milliseconds so a
          press doesn't slip through. A potentiometer is happy at
          50 Hz. A DHT11 temperature sensor can only be read about
          once per second or it returns stale data. If you use a
          single <code>delay()</code> you're forced to the slowest
          interval — the button becomes unresponsive because the
          loop is busy waiting on the DHT.
        </p>

        <p className="text-sm leading-relaxed">
          The fix is one timestamp per sensor. Each sensor
          remembers when it last ran and decides for itself if
          it's due, following the non-blocking{" "}
          <Term k="millis" /> idiom. They all share the same
          loop, but they don't wait on each other.
        </p>
      </Section>

      <Section title="Three sensors, three intervals">
        <CodeBlock code={`const int BUTTON_PIN = 2;
const int POT_PIN    = A0;
const int DHT_PIN    = 4;

const unsigned long BUTTON_MS = 5;
const unsigned long POT_MS    = 20;
const unsigned long DHT_MS    = 2000;

unsigned long lastButton = 0;
unsigned long lastPot    = 0;
unsigned long lastDht    = 0;

void setup() {
  Serial.begin(9600);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
}

void loop() {
  unsigned long now = millis();

  if (now - lastButton >= BUTTON_MS) {
    lastButton = now;
    int b = digitalRead(BUTTON_PIN);
    // act on button state
  }

  if (now - lastPot >= POT_MS) {
    lastPot = now;
    int p = analogRead(POT_PIN);
    // act on pot value
  }

  if (now - lastDht >= DHT_MS) {
    lastDht = now;
    // read DHT and act on temperature
  }
}`} />
      </Section>

      <Figure caption="Three sensors, three timelines. Each fires on its own schedule and none blocks the others.">
        <MultiSensorTimelineDiagram />
      </Figure>

      <Section title="The pattern">
        <p className="text-sm leading-relaxed">
          Every sensor follows the same shape: a constant
          <code>INTERVAL</code>, a <code>last</code> timestamp,
          and a single <code>if</code> that resets the timestamp
          and does the work. Add a fourth sensor by copying the
          block — no rewrites to the ones already there.
        </p>

        <Note>
          Do the expensive work inside the <code>if</code>, not
          outside. Reading the DHT unconditionally every loop
          iteration defeats the whole pattern and can lock the
          sensor up.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/non-blocking-timing",
          "programming/state-machines",
          "programming/timing",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Multi-sensor timeline diagram ──────────────────────────────────────

function MultiSensorTimelineDiagram() {
  const w = 560
  const h = 240
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const leftX = 100
  const trackW = 440
  const row = (y: number, label: string, count: number, color: string) => {
    const tickSpacing = trackW / count
    return (
      <g>
        <text x={leftX - 10} y={y + 4} textAnchor="end" fontSize={11} fill={color} fontFamily={mono}>{label}</text>
        <line x1={leftX} y1={y} x2={leftX + trackW} y2={y} stroke={color} strokeWidth={1.5} />
        {Array.from({ length: count }, (_, i) => {
          const x = leftX + (i + 0.5) * tickSpacing
          return <circle key={i} cx={x} cy={y} r={4} fill={color} />
        })}
      </g>
    )
  }
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        <text x={w / 2} y={25} textAnchor="middle" fontSize={11} fill="#a78bfa" fontFamily={mono}>independent schedules</text>
        {row(70, "button", 20, "#60a5fa")}
        <text x={leftX + trackW + 10} y={74} fontSize={9} fill="#60a5fa" fontFamily={mono}>5 ms</text>

        {row(120, "pot", 10, "#10b981")}
        <text x={leftX + trackW + 10} y={124} fontSize={9} fill="#10b981" fontFamily={mono}>20 ms</text>

        {row(170, "DHT", 3, "#f59e0b")}
        <text x={leftX + trackW + 10} y={174} fontSize={9} fill="#f59e0b" fontFamily={mono}>2000 ms</text>

        <text x={w / 2} y={215} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily={mono}>time →</text>
      </svg>
    </div>
  )
}

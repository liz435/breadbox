// Arduino Uno Reference > Signals & timing > Hardware interrupts

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  CodeBlock,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function InterruptsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "interrupts",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Hardware interrupts"
        subtitle="Two pins that can wake the CPU the instant something changes."
      />

      <Section title="What is an interrupt?">
        <p className="text-sm leading-relaxed">
          Normally your sketch runs <code>loop()</code> over and over,
          checking pins as it goes (polling). A hardware interrupt lets
          the chip pause whatever it's doing the instant a pin changes
          state, run a short function you provide, and then resume right
          where it left off. This is much faster than polling and means
          you never miss a brief signal.
        </p>
      </Section>

      <Section title="Which pins?">
        <p className="text-sm leading-relaxed">
          On the Arduino Uno, only two pins support external interrupts:
        </p>

        <Table
          headers={["Pin", "Interrupt number", "Name"]}
          rows={[
            ["D2", "0", "INT0"],
            ["D3", "1", "INT1"],
          ]}
        />

        <Note>
          Other Arduino boards (Mega, Due, Zero) have more interrupt-capable
          pins. On the Uno, D2 and D3 are it.
        </Note>
      </Section>

      <Section title="Trigger modes">
        <p className="text-sm leading-relaxed">
          When you attach an interrupt, you choose which signal edge fires it:
        </p>

        <Table
          headers={["Mode", "Fires when…"]}
          rows={[
            ["RISING", "The pin goes from LOW to HIGH"],
            ["FALLING", "The pin goes from HIGH to LOW"],
            ["CHANGE", "The pin changes in either direction"],
            ["LOW", "The pin is held LOW (fires repeatedly)"],
          ]}
        />

        <Figure caption="The same pin signal, with arrows marking where each trigger mode would fire. RISING catches low→high edges; FALLING catches high→low; CHANGE catches both.">
          <InterruptEdgesDiagram />
        </Figure>
      </Section>

      <Section title="Using attachInterrupt()">
        <CodeBlock code={`const int BUTTON_PIN = 2;
volatile bool pressed = false;

void handlePress() {
  pressed = true;
}

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  attachInterrupt(
    digitalPinToInterrupt(BUTTON_PIN),
    handlePress,
    FALLING
  );
  Serial.begin(9600);
}

void loop() {
  if (pressed) {
    Serial.println("Button pressed!");
    pressed = false;
  }
}`} />

        <Warn>
          Variables shared between an interrupt handler and the main loop
          must be declared <code>volatile</code>. Without it, the compiler
          may optimize away reads from the variable because it doesn't
          know the value can change outside normal program flow. Keep
          interrupt handlers as short as possible — no <code>delay()</code>,
          no <code>Serial.print()</code>, no long math.
        </Warn>
      </Section>

      <Section title="Polling vs interrupts">
        <p className="text-sm leading-relaxed">
          Use polling (<Term k="digital-read">digitalRead()</Term> in a
          loop) for slow signals like a <Term k="button">button</Term>{" "}
          pressed by a human. Use interrupts when the signal is too fast
          to catch by polling — rotary encoders, frequency counters, or
          wake-from-sleep triggers.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "board/digital-pins",
          "programming/timing",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Interrupt edges timing diagram ─────────────────────────────────────

function InterruptEdgesDiagram() {
  const w = 560
  const h = 200
  const padL = 70
  const padR = 20
  const padT = 30
  const high = padT + 10
  const low = padT + 70

  // Segments: LOW, then HIGH, then LOW, then HIGH
  // Rising edges at x1, x3; falling edges at x2
  const x0 = padL
  const x1 = padL + 120
  const x2 = padL + 260
  const x3 = padL + 380
  const xEnd = w - padR

  const pathD = [
    `M ${x0} ${low}`,
    `L ${x1} ${low}`,
    `L ${x1} ${high}`,
    `L ${x2} ${high}`,
    `L ${x2} ${low}`,
    `L ${x3} ${low}`,
    `L ${x3} ${high}`,
    `L ${xEnd} ${high}`,
  ].join(" ")

  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Rail labels */}
        <text
          x={padL - 8}
          y={high + 4}
          textAnchor="end"
          fontSize={10}
          fill="#9ca3af"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          HIGH
        </text>
        <text
          x={padL - 8}
          y={low + 4}
          textAnchor="end"
          fontSize={10}
          fill="#9ca3af"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          LOW
        </text>
        <text
          x={padL - 50}
          y={(high + low) / 2 + 4}
          textAnchor="end"
          fontSize={10}
          fill="#6b7280"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          pin
        </text>

        {/* Waveform */}
        <path
          d={pathD}
          fill="none"
          stroke="#d1d5db"
          strokeWidth={2}
          strokeLinejoin="miter"
        />

        {/* Edge arrows + labels */}
        {/* x1: rising */}
        <EdgeMarker x={x1} yTop={high} yBot={low} dir="up" color="#10b981" label="RISING" />
        {/* x2: falling */}
        <EdgeMarker x={x2} yTop={high} yBot={low} dir="down" color="#ef4444" label="FALLING" />
        {/* x3: rising */}
        <EdgeMarker x={x3} yTop={high} yBot={low} dir="up" color="#10b981" label="RISING" />

        {/* CHANGE legend: all three edges */}
        <g>
          <circle cx={x1} cy={low + 110} r={4} fill="#a78bfa" />
          <circle cx={x2} cy={low + 110} r={4} fill="#a78bfa" />
          <circle cx={x3} cy={low + 110} r={4} fill="#a78bfa" />
          <text
            x={padL - 8}
            y={low + 114}
            textAnchor="end"
            fontSize={10}
            fill="#a78bfa"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            CHANGE
          </text>
          <line
            x1={padL}
            y1={low + 110}
            x2={xEnd}
            y2={low + 110}
            stroke="#a78bfa"
            strokeWidth={0.6}
            strokeDasharray="3,3"
          />
        </g>
      </svg>
    </div>
  )
}

function EdgeMarker({
  x,
  yTop,
  yBot,
  dir,
  color,
  label,
}: {
  x: number
  yTop: number
  yBot: number
  dir: "up" | "down"
  color: string
  label: string
}) {
  const aY = dir === "up" ? yBot - 6 : yTop + 6
  const bY = dir === "up" ? yTop + 6 : yBot - 6
  const head1Y = dir === "up" ? bY + 6 : bY - 6
  return (
    <g>
      <line
        x1={x}
        y1={aY}
        x2={x}
        y2={bY}
        stroke={color}
        strokeWidth={1.6}
      />
      <polyline
        points={`${x - 4},${head1Y} ${x},${bY} ${x + 4},${head1Y}`}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
      />
      <text
        x={x}
        y={dir === "up" ? yTop - 4 : yBot + 14}
        textAnchor="middle"
        fontSize={10}
        fill={color}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {label}
      </text>
    </g>
  )
}

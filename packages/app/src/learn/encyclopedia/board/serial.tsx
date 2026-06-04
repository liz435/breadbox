// Arduino Uno Reference > Communication > Serial (USB)

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

export function SerialPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "serial",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Serial (USB)"
        subtitle="A text channel between your sketch and your computer."
      />

      <Section title="What it is">
        <p className="text-sm leading-relaxed">
          The Uno's USB port does two jobs. It powers the board, and it
          carries a serial connection between the ATmega328P and your
          computer. Any text your sketch prints with{" "}
          <code className="text-gray-200">Serial.print()</code> shows up
          in a console on your computer, and anything you type back gets
          delivered to the sketch. This is the main way you debug and
          interact with a running Arduino.
        </p>
      </Section>

      <Section title="The Serial Monitor">
        <p className="text-sm leading-relaxed">
          The Arduino IDE (and Breadbox) ships with a{" "}
          <strong className="text-gray-200">Serial Monitor</strong> — a
          little window that opens a serial connection to the board and
          prints everything it receives. When you click "Open Serial
          Monitor," the sketch typically resets so any <code>setup()</code>{" "}
          prints show up from the start.
        </p>
      </Section>

      <Section title="Baud rate">
        <p className="text-sm leading-relaxed">
          "Baud" is the speed of the serial link in bits per second. Both
          sides must agree. In your sketch you pick a baud rate with{" "}
          <code className="text-gray-200">Serial.begin(9600)</code>; in
          the Serial Monitor, pick the same number from the dropdown.
          Common values:
        </p>

        <Table
          headers={["Baud", "Use case"]}
          rows={[
            ["9600", "The default. Safe, slow, fine for printing."],
            ["19200", "Slightly faster, still universal."],
            ["57600", "A good middle ground."],
            ["115200", "Fast. Use when printing a lot or logging sensor data."],
          ]}
        />

        <Warn>
          If the Serial Monitor shows garbage characters (ÂÃ… etc),
          you've almost certainly picked the wrong baud rate. Match
          whatever number is in your <code>Serial.begin()</code> call.
        </Warn>
      </Section>

      <Section title="Pins 0 and 1 are special">
        <p className="text-sm leading-relaxed">
          Behind the scenes, the serial link runs over digital pins{" "}
          <code>D0</code> (RX — receive) and <code>D1</code> (TX — transmit).
          These are the same pins the USB-to-serial chip on the board is
          wired to. That means:
        </p>

        <Figure caption="One byte (0x48, the letter 'H') on the TX line at 9600 baud. Idle HIGH, pulled LOW for the start bit, then 8 data bits LSB-first, then a stop bit HIGH.">
          <SerialByteDiagram />
        </Figure>

        <ul className="mt-2 space-y-1 text-sm leading-relaxed list-disc pl-5">
          <li>Don't wire components to D0/D1 if you also want to use Serial.</li>
          <li>The onboard RX/TX LEDs flash whenever data moves across the USB link — useful as a sanity light.</li>
          <li>Uploading a sketch uses these same pins, which is why the board resets each time.</li>
        </ul>
      </Section>

      <Section title="Quick example">
        <CodeBlock code={`void setup() {
  Serial.begin(9600);
  Serial.println("Sketch started");
}

void loop() {
  Serial.print("Uptime: ");
  Serial.print(millis() / 1000);
  Serial.println(" seconds");
  delay(1000);
}`} />

        <Note>
          Always call <code>Serial.begin()</code> in <code>setup()</code>{" "}
          once before using any other Serial function. Calling
          <code>Serial.print()</code> without it does nothing.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/serial-api",
          "board/digital-pins",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Serial byte timing diagram ─────────────────────────────────────────
//
// Shows one UART frame: idle HIGH, start bit LOW, 8 data bits (LSB first),
// stop bit HIGH. Value is 0x48 = 'H' = 0100 1000 which LSB-first is
// 0,0,0,1,0,0,1,0.

function SerialByteDiagram() {
  const w = 560
  const h = 180
  const padL = 60
  const padR = 20
  const padT = 30
  // Bits: idle, start, d0..d7, stop, idle
  // Value bits for 'H' = 0x48 LSB-first: 0 0 0 1 0 0 1 0
  const bits: { v: 0 | 1; label: string }[] = [
    { v: 1, label: "idle" },
    { v: 0, label: "start" },
    { v: 0, label: "d0" },
    { v: 0, label: "d1" },
    { v: 0, label: "d2" },
    { v: 1, label: "d3" },
    { v: 0, label: "d4" },
    { v: 0, label: "d5" },
    { v: 1, label: "d6" },
    { v: 0, label: "d7" },
    { v: 1, label: "stop" },
    { v: 1, label: "idle" },
  ]
  const usable = w - padL - padR
  const bitW = usable / bits.length
  const high = padT + 10
  const low = padT + 70

  // Build waveform path
  const path: string[] = []
  bits.forEach((b, i) => {
    const x0 = padL + i * bitW
    const x1 = x0 + bitW
    const y = b.v === 1 ? high : low
    if (i === 0) path.push(`M ${x0} ${y}`)
    else {
      // vertical transition if prior bit differs
      const prev = bits[i - 1]!
      if (prev.v !== b.v) {
        path.push(`L ${x0} ${prev.v === 1 ? high : low}`)
        path.push(`L ${x0} ${y}`)
      }
    }
    path.push(`L ${x1} ${y}`)
  })

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
          5 V
        </text>
        <text
          x={padL - 8}
          y={low + 4}
          textAnchor="end"
          fontSize={10}
          fill="#9ca3af"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          0 V
        </text>
        <text
          x={padL - 32}
          y={(high + low) / 2 + 4}
          textAnchor="end"
          fontSize={10}
          fill="#6b7280"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          TX
        </text>

        {/* Dotted grid for bit boundaries */}
        {bits.map((_, i) => (
          <line
            key={`g-${i}`}
            x1={padL + i * bitW}
            y1={high - 6}
            x2={padL + i * bitW}
            y2={low + 14}
            stroke="#27272a"
            strokeDasharray="2,3"
            strokeWidth={0.8}
          />
        ))}
        <line
          x1={padL + bits.length * bitW}
          y1={high - 6}
          x2={padL + bits.length * bitW}
          y2={low + 14}
          stroke="#27272a"
          strokeDasharray="2,3"
          strokeWidth={0.8}
        />

        {/* Waveform */}
        <path
          d={path.join(" ")}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={2}
          strokeLinejoin="miter"
        />

        {/* Bit labels */}
        {bits.map((b, i) => (
          <g key={`l-${i}`}>
            <text
              x={padL + i * bitW + bitW / 2}
              y={low + 28}
              textAnchor="middle"
              fontSize={9}
              fill={
                b.label === "start"
                  ? "#f59e0b"
                  : b.label === "stop"
                    ? "#10b981"
                    : b.label === "idle"
                      ? "#6b7280"
                      : "#d1d5db"
              }
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {b.label}
            </text>
            {b.label.startsWith("d") && (
              <text
                x={padL + i * bitW + bitW / 2}
                y={low + 42}
                textAnchor="middle"
                fontSize={9}
                fill="#9ca3af"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {b.v}
              </text>
            )}
          </g>
        ))}

        {/* One bit time at 9600 baud ≈ 104 µs annotation */}
        <text
          x={padL + bitW / 2 + bitW}
          y={padT - 8}
          textAnchor="middle"
          fontSize={10}
          fill="#9ca3af"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          1 bit ≈ 104 µs @ 9600 baud
        </text>
      </svg>
    </div>
  )
}

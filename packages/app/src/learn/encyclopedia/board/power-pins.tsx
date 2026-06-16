// Arduino Uno Reference > Pins & I/O > Power pins

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function PowerPinsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "power-pins",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Power pins"
        subtitle="5V, 3.3V, GND, VIN, RESET, IOREF — the strip along the bottom-left of the board."
      />

      <Section title="The lineup">
        <p className="text-sm leading-relaxed">
          The power header strip is on the bottom-left edge of the
          board and contains seven pins, in order:
        </p>

        <Figure caption="The power header strip, pin-for-pin. Reading left to right as they sit on the board.">
          <PowerHeaderDiagram />
        </Figure>

        <Table
          headers={["Pin", "Direction", "What it does"]}
          rows={[
            [
              "IOREF",
              "Output",
              "Indicates the board's logic voltage. Always 5 V on the Uno; shields read this pin to auto-configure themselves for 5 V or 3.3 V boards.",
            ],
            [
              "RESET",
              "Input",
              "Pulled HIGH internally. Pull it LOW to reset the ATmega, same as pressing the reset button.",
            ],
            [
              "3V3",
              "Output",
              "Regulated 3.3 V from an onboard LDO. Limited to ~50 mA. Use this to power 3.3 V sensors and modules.",
            ],
            [
              "5V",
              "Output",
              "Regulated 5 V rail. This is the ATmega's supply rail and the main power source for breadboard circuits. Up to ~500 mA when the board is USB-powered.",
            ],
            [
              "GND × 2",
              "—",
              "Ground, 0 V. Two pins here because you usually need more than one. There's also a GND pin on the digital header.",
            ],
            [
              "VIN",
              "Input",
              "The raw unregulated input to the onboard regulator. Ties to the barrel jack. Feed 7–12 V here if you need to power the board without USB.",
            ],
          ]}
        />

        <Note>
          The full reference table (with max currents) lives on the{" "}
          <a
            href="/documentation/arduino-uno"
            className="text-blue-400 hover:underline"
          >
            Arduino Uno docs page
          </a>
          . This page explains the <em>why</em> behind each pin.
        </Note>
      </Section>

      <Section title="5V is the rail you'll use most">
        <p className="text-sm leading-relaxed">
          When you wire a breadboard to the Arduino, 95% of the time
          the flow is:
        </p>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
          <li>Arduino 5V → breadboard + rail (power)</li>
          <li>Arduino GND → breadboard − rail (<Term k="ground">ground</Term>)</li>
          <li>Each component draws from the + rail and returns to the − rail.</li>
        </ul>
        <p className="text-sm leading-relaxed">
          This is so common that the two rails running along the
          edges of every breadboard are called "power rails" for
          exactly this reason. They exist to connect to these two
          pins.
        </p>
      </Section>

      <Section title="5V is an OUTPUT, never an input">
        <Warn>
          Never feed external power into the 5V pin. It bypasses the
          onboard regulator's reverse-polarity protection and can
          damage the ATmega. If you want to power the board from a
          battery or wall adapter, use the{" "}
          <strong>barrel jack</strong> or the{" "}
          <strong>VIN pin</strong> — both route through the regulator.
        </Warn>
        <p className="text-sm leading-relaxed">
          The reason the 5V pin exists as a named header pin at all
          is to make it easy to feed external 5 V components from the
          Arduino's regulated supply, not to put power INTO the
          Arduino.
        </p>
      </Section>

      <Section title="3V3 is tiny but useful">
        <p className="text-sm leading-relaxed">
          The 3.3 V pin is a separate, smaller regulator built into
          the Uno's USB-to-serial chip. It can only supply about 50
          mA, so it's meant for low-power sensors that insist on 3.3
          V logic (some accelerometers, barometers, certain radio
          modules). Don't try to power a strip of LEDs from it — you
          will brown out the regulator.
        </p>
      </Section>

      <Section title="IOREF and the shield ecosystem">
        <p className="text-sm leading-relaxed">
          <code>IOREF</code> is a tiny oddity: it exists so that
          plug-in shields can automatically figure out whether
          they're on a 5 V or 3.3 V board without jumpers. On the
          Uno it's permanently wired to 5 V. You can ignore it unless
          you're designing a shield.
        </p>
      </Section>

      <Section title="RESET — the weird input">
        <p className="text-sm leading-relaxed">
          The RESET pin is pulled HIGH internally. Pulling it LOW
          (even briefly) restarts the ATmega from scratch — same as
          pressing the reset button next to the USB port. You rarely
          wire to this pin in a user sketch; its main use is for
          shields that need to reset the host Arduino
          programmatically, or for custom power-on-reset circuits.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "board/powering",
          "board/anatomy",
          "electronics/power",
          "electronics/ground",
          "electronics/shorts",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Power header layout diagram ────────────────────────────────────────

function PowerHeaderDiagram() {
  const pins = [
    { label: "IOREF", color: "#9ca3af", desc: "shield ref" },
    { label: "RESET", color: "#f59e0b", desc: "reset in" },
    { label: "3V3", color: "#60a5fa", desc: "3.3V out" },
    { label: "5V", color: "#ef4444", desc: "5V out" },
    { label: "GND", color: "#6b7280", desc: "ground" },
    { label: "GND", color: "#6b7280", desc: "ground" },
    { label: "VIN", color: "#a78bfa", desc: "raw in" },
  ]
  const pinW = 62
  const pinH = 34
  const gap = 4
  const padL = 20
  const padT = 28
  const w = padL * 2 + pins.length * (pinW + gap) - gap
  const h = padT + pinH + 44

  return (
    <div className="my-4 flex justify-center rounded border border-border bg-[#0f0f0f] px-6 py-4">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Header strip backing */}
        <rect
          x={padL - 6}
          y={padT - 6}
          width={pins.length * (pinW + gap) - gap + 12}
          height={pinH + 12}
          rx={3}
          fill="#18181b"
          stroke="#27272a"
          strokeWidth={1}
        />
        <text
          x={padL - 6}
          y={padT - 10}
          fontSize={10}
          fill="#6b7280"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          POWER
        </text>

        {pins.map((pin, i) => {
          const x = padL + i * (pinW + gap)
          return (
            <g key={`${pin.label}-${i}`}>
              <rect
                x={x}
                y={padT}
                width={pinW}
                height={pinH}
                rx={3}
                fill="#0f0f0f"
                stroke={pin.color}
                strokeWidth={1.4}
              />
              <text
                x={x + pinW / 2}
                y={padT + pinH / 2 + 4}
                textAnchor="middle"
                fontSize={12}
                fill={pin.color}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight={600}
              >
                {pin.label}
              </text>
              <text
                x={x + pinW / 2}
                y={padT + pinH + 16}
                textAnchor="middle"
                fontSize={9}
                fill="#9ca3af"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {pin.desc}
              </text>
              {/* Pin holes */}
              <circle cx={x + pinW / 2} cy={padT + pinH + 30} r={2} fill="#fbbf24" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

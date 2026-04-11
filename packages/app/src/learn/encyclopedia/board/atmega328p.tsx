// Arduino Uno Reference > Under the hood > The ATmega328P microcontroller

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function Atmega328pPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "atmega328p",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="The ATmega328P microcontroller"
        subtitle="The 28-pin chip in the centre of the board is the entire computer your sketch runs on."
      />

      <Section title="The chip under the hood">
        <p className="text-sm leading-relaxed">
          Almost everything on the Uno exists to support one chip: an
          Atmel (now Microchip) ATmega328P. It's an 8-bit AVR
          microcontroller running at 16 MHz, and every{" "}
          <code>digitalWrite</code>, every <code>analogRead</code>,
          every byte of <code>Serial.print</code> ends up as
          instructions executed by this single part.
        </p>

        <Figure caption="What's inside the ATmega328P: an 8-bit CPU core surrounded by memory, peripherals, and I/O.">
          <Atmega328Diagram />
        </Figure>
      </Section>

      <Section title="By the numbers">
        <Table
          headers={["Resource", "Amount", "Used for"]}
          rows={[
            ["Clock speed", "16 MHz", "One instruction per ~62.5 ns"],
            ["Flash", "32 KB", "Your compiled sketch + bootloader"],
            ["SRAM", "2 KB", "Variables, stack, heap"],
            [
              "EEPROM",
              "1 KB",
              "Non-volatile user data — see the EEPROM page",
            ],
            ["Digital I/O", "23 pins", "14 on the Uno header"],
            ["ADC channels", "6 × 10-bit", "Analog inputs A0–A5"],
            ["Operating voltage", "5 V", "Via the onboard regulator"],
          ]}
        />
      </Section>

      <Section title="Why the numbers matter">
        <p className="text-sm leading-relaxed">
          2 KB of SRAM is small. A single <code>String</code> that
          grows to a few hundred characters already eats a noticeable
          chunk, and the stack has to share what's left. 32 KB of
          flash is roomy for a sketch but tight for anything that
          bundles graphics or sound samples. When a sketch starts
          misbehaving mysteriously on a real Uno, low memory is
          usually the first suspect. The <Term k="eeprom" /> region
          is separate from both and survives power cycles.
        </p>

        <Note>
          Dreamer's simulator runs your sketch on the host CPU, not
          on a real ATmega328P, so you won't hit those memory limits
          in the editor. The numbers here describe the physical chip
          you'll program when you leave the simulator.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/clock-power",
          "programming/eeprom",
          "board/anatomy",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── ATmega328P internal block diagram ──────────────────────────────────

function Atmega328Diagram() {
  const w = 560
  const h = 320
  const chipX = 20
  const chipY = 20
  const chipW = w - 40
  const chipH = h - 40

  type Block = {
    x: number
    y: number
    w: number
    h: number
    title: string
    sub: string
    color: string
  }

  const blocks: Block[] = [
    // CPU core (center top)
    { x: 220, y: 50, w: 140, h: 68, title: "AVR CPU Core", sub: "8-bit, 16 MHz", color: "#f59e0b" },
    // Flash
    { x: 50, y: 50, w: 130, h: 50, title: "Flash", sub: "32 KB program", color: "#60a5fa" },
    // SRAM
    { x: 50, y: 112, w: 130, h: 50, title: "SRAM", sub: "2 KB data", color: "#a78bfa" },
    // EEPROM
    { x: 50, y: 174, w: 130, h: 50, title: "EEPROM", sub: "1 KB non-volatile", color: "#10b981" },

    // Timers
    { x: 400, y: 50, w: 130, h: 50, title: "Timers", sub: "T0 / T1 / T2", color: "#ef4444" },
    // ADC
    { x: 400, y: 112, w: 130, h: 50, title: "ADC", sub: "6 × 10-bit", color: "#ef4444" },
    // USART
    { x: 400, y: 174, w: 130, h: 50, title: "USART", sub: "Serial (RX/TX)", color: "#ef4444" },
    // SPI / I2C
    { x: 400, y: 236, w: 130, h: 50, title: "SPI / TWI", sub: "Sync buses", color: "#ef4444" },

    // GPIO ports (bottom center)
    { x: 220, y: 180, w: 140, h: 50, title: "GPIO Ports", sub: "B / C / D", color: "#d1d5db" },
    // Interrupts
    { x: 220, y: 242, w: 140, h: 44, title: "Interrupt Ctrl", sub: "INT0 / INT1", color: "#d1d5db" },
    // Clock/Osc
    { x: 50, y: 236, w: 130, h: 50, title: "Clock / Osc", sub: "16 MHz crystal in", color: "#6b7280" },
  ]

  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Chip package outline */}
        <rect
          x={chipX}
          y={chipY}
          width={chipW}
          height={chipH}
          rx={8}
          fill="#0f0f0f"
          stroke="#27272a"
          strokeWidth={1.5}
        />
        <text
          x={chipX + 12}
          y={chipY + 16}
          fontSize={10}
          fill="#6b7280"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          ATmega328P
        </text>

        {/* Internal bus line — connects CPU to left/right blocks visually */}
        <line
          x1={190}
          y1={84}
          x2={220}
          y2={84}
          stroke="#374151"
          strokeWidth={1.2}
          strokeDasharray="3,3"
        />
        <line
          x1={360}
          y1={84}
          x2={400}
          y2={84}
          stroke="#374151"
          strokeWidth={1.2}
          strokeDasharray="3,3"
        />
        <line
          x1={290}
          y1={118}
          x2={290}
          y2={180}
          stroke="#374151"
          strokeWidth={1.2}
          strokeDasharray="3,3"
        />

        {/* Blocks */}
        {blocks.map((b) => (
          <g key={b.title}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={4}
              fill="#0f0f0f"
              stroke={b.color}
              strokeWidth={1.4}
            />
            <text
              x={b.x + b.w / 2}
              y={b.y + 22}
              textAnchor="middle"
              fontSize={12}
              fill={b.color}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontWeight={600}
            >
              {b.title}
            </text>
            <text
              x={b.x + b.w / 2}
              y={b.y + 38}
              textAnchor="middle"
              fontSize={10}
              fill="#9ca3af"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {b.sub}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

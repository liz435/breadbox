// Arduino Uno Reference > The board > Board anatomy

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function BoardAnatomyPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "anatomy",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Board anatomy"
        subtitle="The Arduino Uno, labeled — what every connector is for."
      />

      <Section title="The top-down view">
        <p className="text-sm leading-relaxed">
          Before you can wire up a circuit you need to know where every
          connector lives and what it does. An Arduino Uno is small
          (68 × 53 mm, about the size of a credit card) and has exactly
          four edges worth of connectors, plus a single chip in the
          middle doing all the work.
        </p>

        <Figure caption="A top-down view of the Arduino Uno R3.">
          <UnoTopDownDiagram />
        </Figure>

        <Note>
          This is a stylized diagram, not a photo. Pin spacing is
          faithful (every pin is 0.1 inch apart, the spacing of a
          standard breadboard), but the relative sizes of the
          connectors have been nudged for legibility.
        </Note>
      </Section>

      <Section title="The four edges">
        <p className="text-sm leading-relaxed">
          Walking clockwise from the top-left corner:
        </p>

        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-foreground">USB port</strong> (top-left).
            A Type-B socket. This is how you flash sketches to the board
            and how the board appears as a serial device on your
            computer. It also powers the board when no other source is
            plugged in.
          </li>
          <li>
            <strong className="text-foreground">Barrel jack</strong>{" "}
            (bottom-left). A 2.1 mm DC jack for an external 7–12 V
            supply. Used when USB power isn't enough or when the board
            runs standalone.
          </li>
          <li>
            <strong className="text-foreground">Power headers</strong>{" "}
            (bottom edge). Six pins: <code>IOREF</code>,{" "}
            <code>RESET</code>, <code>3V3</code>, <code>5V</code>,{" "}
            <code>GND</code>, <code>GND</code>, <code>VIN</code>. These
            are what you wire to the power rails of a breadboard.
          </li>
          <li>
            <strong className="text-foreground">Analog input headers</strong>{" "}
            (bottom edge, right of the power headers). Six pins labeled{" "}
            <code>A0</code> through <code>A5</code>. Connects analog
            sensors to the board's 10-bit ADC.
          </li>
          <li>
            <strong className="text-foreground">Digital I/O headers</strong>{" "}
            (top edge). Fourteen pins labeled <code>D0</code> through{" "}
            <code>D13</code>, plus <code>GND</code> and{" "}
            <code>AREF</code>. Six of the digital pins (marked{" "}
            <code>~</code>) can do <Term k="pwm">PWM output</Term>.
          </li>
          <li>
            <strong className="text-foreground">ICSP header</strong>{" "}
            (right edge). A 2×3 block of pins for programming the board
            at a lower level than the sketch upload flow. You can safely
            ignore it — most users never touch it.
          </li>
        </ul>
      </Section>

      <Section title="What lives in the middle">
        <p className="text-sm leading-relaxed">
          The two components in the middle of the board that matter:
        </p>

        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-foreground">ATmega328P microcontroller</strong>
            {" "}— the big black chip in a DIP-28 package. This is the
            entire "computer" of the Arduino: 32 KB of flash to hold
            your sketch, 2 KB of RAM, 1 KB of EEPROM, and a single core
            running at 16 MHz. Everything your sketch does happens on
            this chip.
          </li>
          <li>
            <strong className="text-foreground">Onboard LED on pin 13</strong>
            {" "}— a small surface-mount LED labeled <code>L</code>{" "}
            wired directly to digital pin 13, with its own current-
            limiting resistor. It blinks whenever you{" "}
            <code className="text-foreground">digitalWrite(13, HIGH)</code>,
            even if nothing is wired to the header. Great for a{" "}
            "is my sketch running?" sanity check.
          </li>
        </ul>
      </Section>

      <Section title="What you'll actually touch">
        <p className="text-sm leading-relaxed">
          For 95% of beginner projects, you'll only use three parts of
          the board: the <strong className="text-foreground">USB port</strong>{" "}
          (to upload sketches and power the board), the{" "}
          <strong className="text-foreground">digital header row</strong>{" "}
          (to wire components), and the{" "}
          <strong className="text-foreground">power header</strong> (to
          bring 5V and GND out to a breadboard). Everything else is
          there for specialist use cases.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "board/powering",
          "board/onboard-led",
          "board/digital-pins",
          "board/analog-pins",
          "board/power-pins",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Top-down SVG of the Arduino Uno ────────────────────────────────────
//
// Hand-drawn, stylized. Not a datasheet — the goal is "every connector
// is labeled and roughly where it sits." Dimensions are not to scale.

function UnoTopDownDiagram() {
  // Board dimensions and coordinate system — we draw the board inside
  // a 520×340 viewBox so every annotation has room.
  const boardX = 80
  const boardY = 40
  const boardW = 360
  const boardH = 240
  const rx = 8

  // Header strip coordinates
  const headerH = 12
  const topHeaderY = boardY + 6
  const bottomHeaderY = boardY + boardH - headerH - 6

  // Power header strip on the bottom-left side
  const powerStripX = boardX + 88
  const powerStripW = 96
  // Analog header strip on the bottom-right side
  const analogStripX = boardX + powerStripX - boardX + powerStripW + 8
  const analogStripW = 96

  // Digital header strip across the top
  const digitalStripX = boardX + 60
  const digitalStripW = 264

  return (
    <div className="flex justify-center">
      <svg
        viewBox="0 0 520 340"
        width={520}
        height={340}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        <defs>
          <linearGradient id="uno-board" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d7a5f" />
            <stop offset="100%" stopColor="#064e3b" />
          </linearGradient>
          <linearGradient id="uno-chip" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#27272a" />
            <stop offset="100%" stopColor="#18181b" />
          </linearGradient>
        </defs>

        {/* PCB body — the dark teal Arduino green */}
        <rect
          x={boardX}
          y={boardY}
          width={boardW}
          height={boardH}
          rx={rx}
          fill="url(#uno-board)"
          stroke="#064e3b"
          strokeWidth={1.5}
        />

        {/* Mounting holes */}
        {[
          [boardX + 14, boardY + 14],
          [boardX + boardW - 14, boardY + 14],
          [boardX + 14, boardY + boardH - 14],
          [boardX + boardW - 14, boardY + boardH - 14],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={3.5} fill="#0f0f0f" stroke="#022f22" strokeWidth={0.8} />
        ))}

        {/* USB port — on the left edge, top half */}
        <rect
          x={boardX - 18}
          y={boardY + 32}
          width={30}
          height={26}
          rx={2}
          fill="#9ca3af"
          stroke="#4b5563"
          strokeWidth={1.2}
        />
        <rect
          x={boardX - 14}
          y={boardY + 36}
          width={22}
          height={18}
          rx={1}
          fill="#1f2937"
        />

        {/* Barrel jack — on the left edge, bottom half */}
        <rect
          x={boardX - 12}
          y={boardY + boardH - 48}
          width={22}
          height={22}
          rx={4}
          fill="#1f2937"
          stroke="#000"
          strokeWidth={1.2}
        />
        <circle
          cx={boardX - 1}
          cy={boardY + boardH - 37}
          r={3.5}
          fill="#0a0a0a"
          stroke="#374151"
          strokeWidth={0.8}
        />

        {/* ATmega328P microcontroller — big black chip in the middle */}
        <rect
          x={boardX + 130}
          y={boardY + 100}
          width={130}
          height={44}
          rx={2}
          fill="url(#uno-chip)"
          stroke="#000"
          strokeWidth={1.2}
        />
        {/* Pin 1 dot */}
        <circle cx={boardX + 136} cy={boardY + 108} r={2} fill="#4b5563" />
        {/* Chip label */}
        <text
          x={boardX + 195}
          y={boardY + 128}
          textAnchor="middle"
          fontSize={9}
          fill="#9ca3af"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          ATmega328P
        </text>

        {/* Onboard LED on pin 13 — small bright dot with a label */}
        <circle cx={boardX + 220} cy={boardY + 74} r={4} fill="#fbbf24" stroke="#000" strokeWidth={0.8} />
        <text
          x={boardX + 230}
          y={boardY + 78}
          fontSize={8}
          fill="#9ca3af"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          L
        </text>

        {/* Power ON LED */}
        <circle cx={boardX + 52} cy={boardY + 74} r={3} fill="#22c55e" stroke="#000" strokeWidth={0.8} />

        {/* 16 MHz crystal */}
        <rect
          x={boardX + 44}
          y={boardY + 160}
          width={22}
          height={10}
          rx={4}
          fill="#9ca3af"
          stroke="#4b5563"
          strokeWidth={0.8}
        />

        {/* Voltage regulator — TO-220 package, tab + body */}
        <rect
          x={boardX + 36}
          y={boardY + boardH - 84}
          width={14}
          height={22}
          rx={1}
          fill="#18181b"
          stroke="#000"
          strokeWidth={1}
        />
        <rect
          x={boardX + 36 + 3}
          y={boardY + boardH - 88}
          width={8}
          height={6}
          fill="#9ca3af"
        />

        {/* Reset button — small square with a button cap */}
        <rect
          x={boardX + 82}
          y={boardY + 56}
          width={16}
          height={14}
          rx={1}
          fill="#1f2937"
          stroke="#000"
          strokeWidth={1}
        />
        <rect
          x={boardX + 86}
          y={boardY + 60}
          width={8}
          height={6}
          rx={1}
          fill="#dc2626"
        />

        {/* ICSP header — 2×3 block on the right */}
        <rect
          x={boardX + boardW - 28}
          y={boardY + 120}
          width={14}
          height={22}
          rx={1}
          fill="#18181b"
          stroke="#4b5563"
          strokeWidth={0.8}
        />
        {[0, 1, 2].map((r) =>
          [0, 1].map((c) => (
            <circle
              key={`${r}${c}`}
              cx={boardX + boardW - 28 + 4 + c * 6}
              cy={boardY + 120 + 4 + r * 6}
              r={1.2}
              fill="#9ca3af"
            />
          )),
        )}

        {/* Digital header row across the top */}
        <rect
          x={digitalStripX}
          y={topHeaderY}
          width={digitalStripW}
          height={headerH}
          rx={1.5}
          fill="#18181b"
          stroke="#000"
          strokeWidth={1}
        />
        {Array.from({ length: 16 }, (_, i) => (
          <circle
            key={`top-${i}`}
            cx={digitalStripX + 8 + i * ((digitalStripW - 16) / 15)}
            cy={topHeaderY + headerH / 2}
            r={1.5}
            fill="#fbbf24"
          />
        ))}

        {/* Power header strip — bottom-left */}
        <rect
          x={powerStripX}
          y={bottomHeaderY}
          width={powerStripW}
          height={headerH}
          rx={1.5}
          fill="#18181b"
          stroke="#000"
          strokeWidth={1}
        />
        {Array.from({ length: 8 }, (_, i) => (
          <circle
            key={`power-${i}`}
            cx={powerStripX + 8 + i * ((powerStripW - 16) / 7)}
            cy={bottomHeaderY + headerH / 2}
            r={1.5}
            fill="#fbbf24"
          />
        ))}

        {/* Analog header strip — bottom-right */}
        <rect
          x={analogStripX}
          y={bottomHeaderY}
          width={analogStripW}
          height={headerH}
          rx={1.5}
          fill="#18181b"
          stroke="#000"
          strokeWidth={1}
        />
        {Array.from({ length: 6 }, (_, i) => (
          <circle
            key={`analog-${i}`}
            cx={analogStripX + 10 + i * ((analogStripW - 20) / 5)}
            cy={bottomHeaderY + headerH / 2}
            r={1.5}
            fill="#fbbf24"
          />
        ))}

        {/* ── Callout labels ───────────────────────────────────────── */}
        {/* Each callout is a line + text, positioned around the board. */}

        <Callout
          x1={boardX - 3}
          y1={boardY + 45}
          x2={28}
          y2={boardY + 20}
          text="USB Type-B"
          anchor="start"
        />
        <Callout
          x1={boardX - 1}
          y1={boardY + boardH - 37}
          x2={28}
          y2={boardY + boardH + 4}
          text="Barrel jack (7–12V)"
          anchor="start"
        />
        <Callout
          x1={boardX + 90}
          y1={boardY + 63}
          x2={boardX + 60}
          y2={boardY + 22}
          text="Reset"
          anchor="end"
        />
        <Callout
          x1={boardX + 220}
          y1={boardY + 74}
          x2={boardX + 260}
          y2={boardY + 30}
          text="Onboard LED (pin 13)"
          anchor="start"
        />
        <Callout
          x1={boardX + 195}
          y1={boardY + 122}
          x2={boardX + boardW + 10}
          y2={boardY + 112}
          text="ATmega328P"
          anchor="start"
        />
        <Callout
          x1={boardX + 55}
          y1={boardY + 165}
          x2={boardX - 32}
          y2={boardY + 170}
          text="16 MHz crystal"
          anchor="end"
        />
        <Callout
          x1={boardX + 43}
          y1={boardY + boardH - 73}
          x2={boardX - 32}
          y2={boardY + boardH - 56}
          text="5V regulator"
          anchor="end"
        />
        <Callout
          x1={boardX + boardW - 18}
          y1={boardY + 132}
          x2={boardX + boardW + 12}
          y2={boardY + 145}
          text="ICSP header"
          anchor="start"
        />
        <Callout
          x1={digitalStripX + digitalStripW / 2}
          y1={topHeaderY + 2}
          x2={digitalStripX + digitalStripW / 2}
          y2={topHeaderY - 22}
          text="Digital pins D0–D13 + GND + AREF"
          anchor="middle"
        />
        <Callout
          x1={powerStripX + powerStripW / 2}
          y1={bottomHeaderY + headerH - 2}
          x2={powerStripX + powerStripW / 2 - 30}
          y2={bottomHeaderY + headerH + 32}
          text="Power headers"
          anchor="middle"
        />
        <Callout
          x1={analogStripX + analogStripW / 2}
          y1={bottomHeaderY + headerH - 2}
          x2={analogStripX + analogStripW / 2 + 30}
          y2={bottomHeaderY + headerH + 32}
          text="Analog A0–A5"
          anchor="middle"
        />
      </svg>
    </div>
  )
}

function Callout({
  x1,
  y1,
  x2,
  y2,
  text,
  anchor,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  text: string
  anchor: "start" | "middle" | "end"
}) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6b7280" strokeWidth={0.8} />
      <circle cx={x1} cy={y1} r={1.8} fill="#9ca3af" />
      <text
        x={x2}
        y={y2}
        textAnchor={anchor}
        fontSize={10}
        fill="#d1d5db"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {text}
      </text>
    </g>
  )
}

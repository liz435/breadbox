// Arduino Uno Reference > Pins & I/O > Pin header layout

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function ShieldHeadersPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "shield-headers",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Pin header layout"
        subtitle="Where each pin physically sits on the board, for layout planning."
      />

      <Section title="Why this matters">
        <p className="text-sm leading-relaxed">
          When you're planning a breadboard layout, it saves time to
          know the physical arrangement of the pins you're going to
          wire to. The Uno's pins are grouped into four header strips
          around the edges of the board, and knowing which strip each
          pin lives on lets you route wires sensibly instead of
          discovering mid-build that the pin you want is on the
          opposite side.
        </p>
      </Section>

      <Section title="The four strips">
        <p className="text-sm leading-relaxed">
          All of the Uno's user-accessible pins live on four header
          strips along the edges of the PCB:
        </p>

        <PinHeaderMap />
      </Section>

      <Section title="Pin-to-strip cheat sheet">
        <ul className="space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">Top-left strip</strong>{" "}
            (8 pins): <code>D8</code>–<code>D13</code> plus{" "}
            <code>GND</code> and <code>AREF</code>. The onboard LED
            sits just below pin 13 on this strip.
          </li>
          <li>
            <strong className="text-gray-200">Top-right strip</strong>{" "}
            (8 pins): <code>D0</code>–<code>D7</code>. Pins 0 and 1
            are on the far-right end (closest to the USB-serial
            chip).
          </li>
          <li>
            <strong className="text-gray-200">Bottom-left strip</strong>{" "}
            (8 pins): <code>IOREF</code>, <code>RESET</code>,{" "}
            <code>3V3</code>, <code>5V</code>, <code>GND</code>,{" "}
            <code>GND</code>, <code>VIN</code>, plus one unused pin.
          </li>
          <li>
            <strong className="text-gray-200">Bottom-right strip</strong>{" "}
            (6 pins): <code>A0</code> through <code>A5</code>. The
            I²C bus (A4 = SDA, A5 = SCL) is at the right end of this
            strip.
          </li>
        </ul>

        <Note>
          All four strips are spaced at the standard 0.1 inch (2.54
          mm) pitch so any 0.1" header plug fits them. The gap
          between the top-left and top-right digital strips is
          slightly wider than 0.1" (an Arduino hardware quirk from
          2005 that the project never fixed — it breaks shield
          hardware that assumes a uniform 0.1" grid).
        </Note>
      </Section>

      <Section title="Practical layout tips">
        <ul className="space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">Power and sensors on one side, signals on the other.</strong>{" "}
            Put the Arduino on the left of your breadboard with the
            bottom headers facing down. Run 5V and GND to the power
            rails from the bottom-left strip, and connect analog
            sensors (A0–A5) to the top rails. Use the top-edge
            digital pins for outputs (LEDs, servos, buzzers) so the
            wires don't cross over your power rails.
          </li>
          <li>
            <strong className="text-gray-200">Avoid D0 and D1 if you can.</strong>{" "}
            They're physically convenient (at the end of the strip)
            but they're shared with USB serial. Pick D2 or higher for
            actual wiring whenever possible.
          </li>
          <li>
            <strong className="text-gray-200">Group PWM pins.</strong>{" "}
            The PWM-capable pins are scattered (3, 5, 6, 9, 10, 11).
            If you need three PWM outputs — say, an RGB LED — use
            9, 10, 11 together; they're adjacent on the top-left
            strip and make wiring cleaner.
          </li>
        </ul>
      </Section>

      <SeeAlso
        refs={[
          "board/anatomy",
          "board/digital-pins",
          "board/analog-pins",
          "board/power-pins",
          "electronics/breadboards",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Inline SVG: a stylized top-down of the Uno with just the headers
// highlighted. Uses the same visual vocabulary as board/anatomy.tsx
// (dark teal PCB rectangle with yellow header pin dots) but stripped
// down to JUST the four strips + labels.

function PinHeaderMap() {
  const boardX = 60
  const boardY = 40
  const boardW = 360
  const boardH = 200

  return (
    <figure className="my-6">
      <div className="flex justify-center rounded border border-neutral-800 bg-[#0f0f0f] px-6 py-4">
        <svg
          viewBox="0 0 480 280"
          width={480}
          height={280}
          className="max-w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="pin-header-board" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d7a5f" />
              <stop offset="100%" stopColor="#064e3b" />
            </linearGradient>
          </defs>

          {/* PCB */}
          <rect
            x={boardX}
            y={boardY}
            width={boardW}
            height={boardH}
            rx={8}
            fill="url(#pin-header-board)"
            stroke="#064e3b"
            strokeWidth={1.5}
          />

          {/* ── Top strips (D0–D13) ─────────────────────────────── */}
          {/* Top-right: D0–D7 */}
          <HeaderStrip
            x={boardX + 40}
            y={boardY + 8}
            pinCount={8}
            labels={["D7", "D6", "D5", "D4", "D3", "D2", "D1", "D0"]}
            aboveLabels
          />
          {/* Top-left: D8–D13 + GND + AREF */}
          <HeaderStrip
            x={boardX + 200}
            y={boardY + 8}
            pinCount={8}
            labels={["D13", "D12", "D11", "D10", "D9", "D8", "AREF", "GND"]}
            aboveLabels
          />

          {/* ── Bottom strips ───────────────────────────────────── */}
          {/* Bottom-left: Power pins (8 slots, 7 named) */}
          <HeaderStrip
            x={boardX + 40}
            y={boardY + boardH - 20}
            pinCount={8}
            labels={["IOREF", "RES", "3V3", "5V", "GND", "GND", "VIN", ""]}
            belowLabels
          />
          {/* Bottom-right: Analog A0–A5 */}
          <HeaderStrip
            x={boardX + 210}
            y={boardY + boardH - 20}
            pinCount={6}
            labels={["A0", "A1", "A2", "A3", "A4", "A5"]}
            belowLabels
          />

          {/* ── Callouts ─────────────────────────────────────────── */}
          <text
            x={240}
            y={25}
            textAnchor="middle"
            fontSize={10}
            fill="#d1d5db"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Digital pins D0–D13 (top edge)
          </text>
          <text
            x={130}
            y={270}
            textAnchor="middle"
            fontSize={10}
            fill="#d1d5db"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Power header
          </text>
          <text
            x={330}
            y={270}
            textAnchor="middle"
            fontSize={10}
            fill="#d1d5db"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Analog A0–A5
          </text>
        </svg>
      </div>
      <figcaption className="mt-1 text-center text-xs text-gray-500">
        Top-down layout of the Uno's header strips. Labels read
        left-to-right from the strip's left end.
      </figcaption>
    </figure>
  )
}

function HeaderStrip({
  x,
  y,
  pinCount,
  labels,
  aboveLabels,
  belowLabels,
}: {
  x: number
  y: number
  pinCount: number
  labels: string[]
  aboveLabels?: boolean
  belowLabels?: boolean
}) {
  const pinSpacing = 16
  const stripW = pinCount * pinSpacing + 8
  const stripH = 12
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={stripW}
        height={stripH}
        rx={1.5}
        fill="#18181b"
        stroke="#000"
        strokeWidth={1}
      />
      {Array.from({ length: pinCount }, (_, i) => {
        const cx = x + 8 + i * pinSpacing
        const cy = y + stripH / 2
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={2.2} fill="#fbbf24" />
            {labels[i] && (
              <text
                x={cx}
                y={aboveLabels ? y - 4 : belowLabels ? y + stripH + 10 : cy}
                textAnchor="middle"
                fontSize={8}
                fill="#9ca3af"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {labels[i]}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

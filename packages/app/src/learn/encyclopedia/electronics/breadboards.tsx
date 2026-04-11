// Electronics Fundamentals > Components > Breadboards

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

export function BreadboardsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "breadboards",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Breadboards"
        subtitle="A grid of holes with hidden metal clips underneath — the standard way to wire a prototype."
      />

      <Section title="The anatomy">
        <p className="text-sm leading-relaxed">
          A typical half-size breadboard has two zones: a{" "}
          <strong className="text-gray-200">main area</strong> with rows
          of five holes, and two pairs of long{" "}
          <strong className="text-gray-200">power rails</strong> running
          down the sides. Underneath each row is a metal clip that
          electrically ties all five holes together into a single net.
        </p>

        <Figure caption="Half-size breadboard, top-down. Highlighted groups share one net underneath.">
          <BreadboardDiagram />
        </Figure>
      </Section>

      <Section title="Rows of five">
        <p className="text-sm leading-relaxed">
          Each horizontal row in the main area has{" "}
          <strong className="text-gray-200">five holes</strong> joined
          together. Drop a wire into one hole and a component leg into
          another hole in the same row, and they're connected — no
          soldering required. Drop into the next row and they're not.
        </p>

        <Note>
          Adjacent rows are <em className="text-gray-200">not</em>{" "}
          connected. The whole point of the grid is that each row is
          its own isolated net.
        </Note>
      </Section>

      <Section title="The center gap">
        <p className="text-sm leading-relaxed">
          A gap runs down the middle of the main area, splitting every
          row into two halves of five holes each. The gap exists so
          that a <strong className="text-gray-200">DIP chip</strong>{" "}
          (the kind with two rows of legs) can straddle it — the legs
          on the left land in one row's left half, and the legs on the
          right land in the same row's right half, giving each pin its
          own isolated net.
        </p>
      </Section>

      <Section title="Power rails">
        <p className="text-sm leading-relaxed">
          The long rails down the sides are marked red (+) and blue or
          black (−). Unlike the main rows, these are continuous all the
          way down. Wire one end to your Arduino's 5 V and GND pins and
          the whole length of the rail is powered — handy for
          distributing power to multiple components.
        </p>

        <Note>
          Some longer breadboards split the power rails in the middle.
          If power works on one half of the rail but not the other,
          add a short jumper across the break.
        </Note>
      </Section>

      <Section title="The resistor-across-the-gap rule">
        <p className="text-sm leading-relaxed">
          When you're wiring a resistor in series with an LED, put each
          component on a different row, bridging the rows with the
          component's legs. A common pattern is:
        </p>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed list-disc pl-5">
          <li>Resistor straddles rows A and B (legs in two different rows).</li>
          <li>LED's anode joins the resistor in row B.</li>
          <li>LED's cathode lands in row C, which connects to the ground rail.</li>
        </ul>
        <p className="text-sm leading-relaxed mt-2">
          Bridging rows with a component is how you force current to
          flow <em className="text-gray-200">through</em> the component
          instead of skipping it.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "board/anatomy",
          "board/shield-headers",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Breadboard top-down diagram ────────────────────────────────────────

function BreadboardDiagram() {
  const pitch = 14
  const cols = 30
  const padX = 24
  const padY = 22
  const w = padX * 2 + cols * pitch
  const h = 240

  const railRow1Y = padY
  const railRow2Y = padY + pitch
  const mainTopY = padY + pitch * 3
  const gapY = mainTopY + pitch * 5 + pitch / 2
  const mainBotY = gapY + pitch / 2
  const railRow3Y = mainBotY + pitch * 5 + pitch / 2
  const railRow4Y = railRow3Y + pitch

  const holes: { x: number; y: number; fill?: string }[] = []

  // Top power rails
  for (let c = 0; c < cols; c++) {
    holes.push({ x: padX + c * pitch, y: railRow1Y })
    holes.push({ x: padX + c * pitch, y: railRow2Y })
  }
  // Main area top half (5 rows)
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < cols; c++) {
      holes.push({ x: padX + c * pitch, y: mainTopY + r * pitch })
    }
  }
  // Main area bottom half (5 rows)
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < cols; c++) {
      holes.push({ x: padX + c * pitch, y: mainBotY + r * pitch })
    }
  }
  // Bottom power rails
  for (let c = 0; c < cols; c++) {
    holes.push({ x: padX + c * pitch, y: railRow3Y })
    holes.push({ x: padX + c * pitch, y: railRow4Y })
  }

  // Highlight columns (row-of-5 groups) — highlight col 4 top and col 10 bottom
  const highlightTopCol = 5
  const highlightBotCol = 12

  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        {/* Board body */}
        <rect x={4} y={4} width={w - 8} height={h - 8} rx={4} fill="#1a1a1a" stroke="#374151" strokeWidth={1.2} />

        {/* Power rail stripes */}
        <rect x={padX - 8} y={railRow1Y - 6} width={cols * pitch + 16} height={1} fill="#ef4444" opacity={0.6} />
        <text x={padX - 12} y={railRow1Y + 3} textAnchor="end" fontSize={10} fill="#ef4444" fontFamily="ui-monospace, Menlo, monospace">+</text>
        <rect x={padX - 8} y={railRow2Y + 6} width={cols * pitch + 16} height={1} fill="#60a5fa" opacity={0.6} />
        <text x={padX - 12} y={railRow2Y + 4} textAnchor="end" fontSize={10} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">−</text>

        <rect x={padX - 8} y={railRow3Y - 6} width={cols * pitch + 16} height={1} fill="#ef4444" opacity={0.6} />
        <text x={padX - 12} y={railRow3Y + 3} textAnchor="end" fontSize={10} fill="#ef4444" fontFamily="ui-monospace, Menlo, monospace">+</text>
        <rect x={padX - 8} y={railRow4Y + 6} width={cols * pitch + 16} height={1} fill="#60a5fa" opacity={0.6} />
        <text x={padX - 12} y={railRow4Y + 4} textAnchor="end" fontSize={10} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">−</text>

        {/* Highlighted rail trace (top red rail) */}
        <rect
          x={padX - 4}
          y={railRow1Y - 3}
          width={cols * pitch + 8}
          height={6}
          fill="#ef4444"
          fillOpacity={0.18}
          stroke="#ef4444"
          strokeWidth={0.8}
          strokeDasharray="2 2"
        />

        {/* Highlighted row-of-5 top */}
        <rect
          x={padX + highlightTopCol * pitch - 5}
          y={mainTopY - 3}
          width={10}
          height={5 * pitch}
          fill="#60a5fa"
          fillOpacity={0.22}
          stroke="#60a5fa"
          strokeWidth={0.8}
          strokeDasharray="2 2"
        />

        {/* Highlighted row-of-5 bottom */}
        <rect
          x={padX + highlightBotCol * pitch - 5}
          y={mainBotY - 3}
          width={10}
          height={5 * pitch}
          fill="#a78bfa"
          fillOpacity={0.22}
          stroke="#a78bfa"
          strokeWidth={0.8}
          strokeDasharray="2 2"
        />

        {/* Center gap label */}
        <line x1={padX - 4} y1={gapY} x2={padX + cols * pitch + 4} y2={gapY} stroke="#6b7280" strokeWidth={0.6} strokeDasharray="3 3" />
        <text x={w - 6} y={gapY + 4} textAnchor="end" fontSize={9} fill="#6b7280" fontFamily="ui-monospace, Menlo, monospace">DIP gap</text>

        {/* Holes */}
        {holes.map((hole, i) => (
          <circle key={i} cx={hole.x} cy={hole.y} r={1.8} fill="#0f0f0f" stroke="#4b5563" strokeWidth={0.5} />
        ))}

        {/* Annotations */}
        <text x={padX + highlightTopCol * pitch + 14} y={mainTopY + 8} fontSize={9} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">row of 5 (one net)</text>
        <text x={padX + highlightBotCol * pitch + 14} y={mainBotY + 8} fontSize={9} fill="#a78bfa" fontFamily="ui-monospace, Menlo, monospace">another row of 5</text>
        <text x={padX + cols * pitch + 20} y={railRow1Y + 4} fontSize={9} fill="#ef4444" fontFamily="ui-monospace, Menlo, monospace">rail runs the length</text>
      </svg>
    </div>
  )
}

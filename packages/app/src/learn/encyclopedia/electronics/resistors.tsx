// Electronics Fundamentals > Components > Resistors

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

export function ResistorsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "resistors",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Resistors"
        subtitle="The humble color-striped cylinder that limits current in almost every hobby circuit."
      />

      <Section title="What they do">
        <p className="text-sm leading-relaxed">
          A <Term k="resistor">resistor</Term> opposes current flow by
          a fixed amount. Drop one into a circuit and{" "}
          <Term k="ohms-law">Ohm's law</Term> tells you exactly how
          much current the rest of the circuit can pull. Resistors are
          non-polar — either end goes to either side.
        </p>
      </Section>

      <Section title="Reading the color bands">
        <p className="text-sm leading-relaxed">
          Through-hole resistors are marked with colored stripes because
          the numbers would be too small to read. Four-band resistors
          have three value bands plus a tolerance band; five-band
          resistors have an extra digit for precision parts.
        </p>

        <Table
          headers={["Color", "Digit", "Multiplier"]}
          rows={[
            ["Black", "0", "×1"],
            ["Brown", "1", "×10"],
            ["Red", "2", "×100"],
            ["Orange", "3", "×1 k"],
            ["Yellow", "4", "×10 k"],
            ["Green", "5", "×100 k"],
            ["Blue", "6", "×1 M"],
            ["Violet", "7", "×10 M"],
            ["Gray", "8", "—"],
            ["White", "9", "—"],
          ]}
        />

        <p className="text-sm leading-relaxed">
          For a 4-band resistor, the first two bands give digits, the
          third is a power-of-ten multiplier, and the fourth is
          tolerance (gold = 5%, silver = 10%). Red-red-brown-gold
          decodes as 2, 2, ×10, giving 220 Ω ± 5%.
        </p>

        <Figure caption="A 220 Ω, 5% resistor. Red (2) · Red (2) · Brown (×10) · Gold (±5%).">
          <ResistorColorBands />
        </Figure>

        <Note>
          When in doubt, grab a multimeter and measure directly. Faded
          bands are the #1 reason a kit resistor gets mis-identified.
        </Note>
      </Section>

      <Section title="Standard E-series values">
        <p className="text-sm leading-relaxed">
          Resistors come in fixed "E-series" values rather than every
          possible number. The most common series for beginners is E12
          — 12 values per decade, enough for 5% tolerance parts:
        </p>

        <p className="mt-2 text-sm leading-relaxed font-mono text-foreground">
          1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2
        </p>

        <p className="text-sm leading-relaxed mt-2">
          Multiply by 10, 100, 1 k, 10 k, etc. to get the common parts.
          220, 330, 470, 1 k, 10 k, and 100 k are in every Arduino kit
          because they cover LED limiting, pull-ups, and general
          purpose signaling.
        </p>
      </Section>

      <Section title="Power rating">
        <p className="text-sm leading-relaxed">
          Every resistor has a wattage rating — how much power it can
          dissipate before it cooks. The standard hobby size is ¼ W
          (0.25 W). For 5 V Arduino work, ¼ W is more than enough for
          any resistor above ~100 Ω. If you're switching mains voltages
          or motor loads, do the <code>P = V × I</code> math and size
          up accordingly.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "electronics/ohms-law",
          "electronics/leds",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Resistor color-band diagram ────────────────────────────────────────

function ResistorColorBands() {
  const w = 420
  const h = 140
  const bodyX = 80
  const bodyY = 50
  const bodyW = 260
  const bodyH = 44
  const bands = [
    { x: 120, color: "#ef4444", label: "Red" },    // 2
    { x: 150, color: "#ef4444", label: "Red" },    // 2
    { x: 180, color: "#a16207", label: "Brown" },  // ×10
    { x: 290, color: "#eab308", label: "Gold" },   // 5%
  ]
  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} xmlns="http://www.w3.org/2000/svg" className="max-w-full">
        <rect x={0} y={0} width={w} height={h} fill="#0f0f0f" />
        {/* Left lead */}
        <line x1={20} y1={bodyY + bodyH / 2} x2={bodyX} y2={bodyY + bodyH / 2} stroke="#9ca3af" strokeWidth={2} />
        {/* Right lead */}
        <line x1={bodyX + bodyW} y1={bodyY + bodyH / 2} x2={w - 20} y2={bodyY + bodyH / 2} stroke="#9ca3af" strokeWidth={2} />
        {/* Body */}
        <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx={18} ry={18} fill="#d4a574" stroke="#9ca3af" strokeWidth={1.4} />
        {/* Bands */}
        {bands.map((b, i) => (
          <rect key={i} x={b.x} y={bodyY} width={14} height={bodyH} fill={b.color} />
        ))}
        {/* Labels */}
        <text x={127} y={bodyY + bodyH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">Red</text>
        <text x={127} y={bodyY + bodyH + 26} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">2</text>
        <text x={157} y={bodyY + bodyH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">Red</text>
        <text x={157} y={bodyY + bodyH + 26} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">2</text>
        <text x={187} y={bodyY + bodyH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">Brown</text>
        <text x={187} y={bodyY + bodyH + 26} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">×10</text>
        <text x={297} y={bodyY + bodyH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">Gold</text>
        <text x={297} y={bodyY + bodyH + 26} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="ui-monospace, Menlo, monospace">±5%</text>
        {/* Result */}
        <text x={w / 2} y={h - 8} textAnchor="middle" fontSize={12} fill="#60a5fa" fontFamily="ui-monospace, Menlo, monospace">
          = 220 Ω ± 5%
        </text>
        {/* Top label */}
        <text x={w / 2} y={28} textAnchor="middle" fontSize={11} fill="#d1d5db" fontFamily="ui-monospace, Menlo, monospace">
          4-band resistor
        </text>
      </svg>
    </div>
  )
}

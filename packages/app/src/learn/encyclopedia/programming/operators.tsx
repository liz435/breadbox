// Arduino Programming > C++ essentials > Operators

import {
  LearnLayout,
  PageTitle,
  Section,
  Table,
  CodeBlock,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function OperatorsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "operators",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Operators"
        subtitle="The little punctuation marks that do all the work."
      />

      <Section title="Arithmetic">
        <Table
          headers={["Operator", "Meaning", "Example"]}
          rows={[
            ["+", "Addition", "a + b"],
            ["−", "Subtraction", "a - b"],
            ["*", "Multiplication", "a * b"],
            ["/", "Division", "a / b"],
            ["%", "Modulo (remainder)", "a % b"],
          ]}
        />

        <Figure caption="The compiler parses (a + b) * 2 as a tree — the * is the root, the + is a child, and 2 is a leaf.">
          <ExpressionTreeDiagram />
        </Figure>
      </Section>

      <Section title="Comparison">
        <p className="text-sm leading-relaxed">
          Comparison operators return a <code>bool</code>. Use them
          inside <code>if</code> statements and loop conditions.
        </p>
        <Table
          headers={["Operator", "Meaning"]}
          rows={[
            ["==", "Equal to"],
            ["!=", "Not equal"],
            ["<", "Less than"],
            [">", "Greater than"],
            ["<=", "Less than or equal"],
            [">=", "Greater than or equal"],
          ]}
        />
      </Section>

      <Section title="Logical">
        <Table
          headers={["Operator", "Meaning"]}
          rows={[
            ["&&", "AND (both sides must be true)"],
            ["||", "OR (either side may be true)"],
            ["!", "NOT (inverts a bool)"],
          ]}
        />
      </Section>

      <Section title="Assignment">
        <p className="text-sm leading-relaxed">
          The plain <code>=</code> assigns a value. The compound forms
          are shorthand for "apply this operator, then assign":
        </p>

        <Table
          headers={["Operator", "Equivalent to"]}
          rows={[
            ["x = 5", "Plain assignment"],
            ["x += 3", "x = x + 3"],
            ["x -= 3", "x = x - 3"],
            ["x *= 2", "x = x * 2"],
            ["x /= 2", "x = x / 2"],
          ]}
        />
      </Section>

      <Section title="Increment and decrement">
        <p className="text-sm leading-relaxed">
          The <code>++</code> and <code>--</code> operators add or subtract
          1 from a variable. They appear everywhere in <code>for</code>{" "}
          loops.
        </p>

        <CodeBlock code={`int i = 0;
i++;  // i is now 1 — same as i = i + 1
i--;  // i is now 0
for (int j = 0; j < 10; j++) {
  // run 10 times
}`} />
      </Section>

      <SeeAlso
        refs={[
          "programming/variables",
          "programming/control-flow",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Expression tree diagram ────────────────────────────────────────────

function ExpressionTreeDiagram() {
  const w = 360
  const h = 200
  const node = (
    cx: number,
    cy: number,
    text: string,
    fill = "#0f0f0f",
    stroke = "#60a5fa",
  ) => (
    <g>
      <circle cx={cx} cy={cy} r={20} fill={fill} stroke={stroke} strokeWidth={2} />
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fontSize={14}
        fill="#d1d5db"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {text}
      </text>
    </g>
  )
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        <line x1={180} y1={50} x2={110} y2={115} stroke="#6b7280" strokeWidth={1.5} />
        <line x1={180} y1={50} x2={250} y2={115} stroke="#6b7280" strokeWidth={1.5} />
        <line x1={110} y1={135} x2={70} y2={170} stroke="#6b7280" strokeWidth={1.5} />
        <line x1={110} y1={135} x2={150} y2={170} stroke="#6b7280" strokeWidth={1.5} />
        {node(180, 35, "*", "#0f0f0f", "#a78bfa")}
        {node(110, 120, "+")}
        {node(250, 120, "2", "#0f0f0f", "#10b981")}
        {node(70, 180, "a", "#0f0f0f", "#10b981")}
        {node(150, 180, "b", "#0f0f0f", "#10b981")}
      </svg>
    </div>
  )
}

// Arduino Programming > C++ essentials > Operators

import {
  LearnLayout,
  PageTitle,
  Section,
  Table,
  CodeBlock,
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

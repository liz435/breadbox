// Arduino Programming > C++ essentials > Comments

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function CommentsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "comments",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Comments"
        subtitle="Notes for humans. The compiler ignores them completely."
      />

      <Section title="Two flavors">
        <p className="text-sm leading-relaxed">
          C++ has two kinds of comments, and you can use either:
        </p>

        <CodeBlock code={`// Line comment — runs to the end of the line.

/*
  Block comment — spans as many lines as you like,
  and ends at the closing star-slash.
*/`} />

        <p className="text-sm leading-relaxed">
          Line comments (<code>//</code>) are the common choice for
          short notes and one-line explanations. Block comments
          (<code>/* */</code>) are useful for disabling several lines at
          once, or for a file-level header at the top of a sketch.
        </p>
      </Section>

      <Section title="What to comment">
        <p className="text-sm leading-relaxed">
          A comment should explain <em className="text-gray-200">why</em>,
          not <em className="text-gray-200">what</em>. The code already
          shows what it does; the comment adds the intent a reader can't
          see.
        </p>

        <CodeBlock code={`// BAD — restates the code
i++;  // add 1 to i

// GOOD — explains why
i++;  // advance to the next LED in the chain`} />
      </Section>

      <Section title="Commenting out code">
        <p className="text-sm leading-relaxed">
          A quick way to disable a line temporarily is to prefix it with{" "}
          <code>//</code>. To disable a whole block, wrap it in{" "}
          <code>/* */</code>:
        </p>

        <CodeBlock code={`void loop() {
  // digitalWrite(13, HIGH);  // disabled for now
  analogWrite(9, 128);

  /*
  Serial.println("debug");
  delay(100);
  */
}`} />
      </Section>

      <Figure caption="The transpiler strips comments before the code runs — they never reach the chip.">
        <CommentStripDiagram />
      </Figure>

      <Section title="How Dreamer handles them">
        <p className="text-sm leading-relaxed">
          Dreamer's transpiler strips every comment before running your
          sketch, exactly the way the Arduino toolchain does. A comment
          can't affect behavior — even if you write something absurd like{" "}
          <code>/* digitalWrite(13, HIGH); */</code>, nothing runs.
        </p>

        <Note>
          One edge case: block comments don't nest. Writing{" "}
          <code>/* outer /* inner */ still outer */</code> ends at the
          first <code>*/</code> and leaves the rest of the line as real
          code. Stick to line comments when nesting is a risk.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/sketch-structure",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Comment-strip transpiler diagram ───────────────────────────────────

function CommentStripDiagram() {
  const w = 560
  const h = 180
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Source with comments */}
        <text x={115} y={18} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>your source</text>
        <rect x={10} y={25} width={210} height={130} rx={4} fill="#0f0f0f" stroke="#6b7280" strokeWidth={1.5} />
        <text x={20} y={50} fontSize={11} fill="#6b7280" fontFamily={mono}>// blink the LED</text>
        <text x={20} y={68} fontSize={11} fill="#d1d5db" fontFamily={mono}>void loop() {`{`}</text>
        <text x={30} y={86} fontSize={11} fill="#d1d5db" fontFamily={mono}>digitalWrite(13,HIGH);</text>
        <text x={30} y={104} fontSize={11} fill="#6b7280" fontFamily={mono}>/* on */</text>
        <text x={30} y={122} fontSize={11} fill="#d1d5db" fontFamily={mono}>delay(500);</text>
        <text x={20} y={140} fontSize={11} fill="#d1d5db" fontFamily={mono}>{`}`}</text>

        {/* Arrow */}
        <line x1={230} y1={90} x2={320} y2={90} stroke="#a78bfa" strokeWidth={2} />
        <polyline points="312,84 320,90 312,96" fill="none" stroke="#a78bfa" strokeWidth={2} />
        <text x={275} y={80} textAnchor="middle" fontSize={10} fill="#a78bfa" fontFamily={mono}>transpiler</text>

        {/* Output no comments */}
        <text x={440} y={18} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>what runs</text>
        <rect x={335} y={25} width={210} height={130} rx={4} fill="#0f0f0f" stroke="#10b981" strokeWidth={1.5} />
        <text x={345} y={68} fontSize={11} fill="#d1d5db" fontFamily={mono}>void loop() {`{`}</text>
        <text x={355} y={86} fontSize={11} fill="#d1d5db" fontFamily={mono}>digitalWrite(13,HIGH);</text>
        <text x={355} y={104} fontSize={11} fill="#d1d5db" fontFamily={mono}>delay(500);</text>
        <text x={345} y={122} fontSize={11} fill="#d1d5db" fontFamily={mono}>{`}`}</text>
      </svg>
    </div>
  )
}

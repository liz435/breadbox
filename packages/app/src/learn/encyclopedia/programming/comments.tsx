// Arduino Programming > C++ essentials > Comments

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
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

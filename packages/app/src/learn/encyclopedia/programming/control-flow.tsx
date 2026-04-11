// Arduino Programming > C++ essentials > Control flow

import {
  LearnLayout,
  PageTitle,
  Section,
  CodeBlock,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function ControlFlowPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "control-flow",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Control flow"
        subtitle="Deciding what runs, and how many times."
      />

      <Section title="if / else">
        <p className="text-sm leading-relaxed">
          Runs a block only when a condition is true. The <code>else</code>{" "}
          branch is optional, and can chain into another <code>if</code>.
        </p>

        <CodeBlock code={`int light = analogRead(A0);

if (light < 200) {
  digitalWrite(13, HIGH);   // dark — turn LED on
} else if (light < 600) {
  digitalWrite(13, LOW);    // dim — LED off
} else {
  digitalWrite(13, LOW);    // bright — LED off
}`} />

        <Figure caption="Classic flowchart for a two-branch decision.">
          <FlowchartDiagram />
        </Figure>
      </Section>

      <Section title="while">
        <p className="text-sm leading-relaxed">
          Keeps running a block as long as its condition stays true.
          Check the condition before running each iteration.
        </p>

        <CodeBlock code={`int count = 0;
while (count < 5) {
  Serial.println(count);
  count++;
}`} />
      </Section>

      <Section title="for">
        <p className="text-sm leading-relaxed">
          A <code>for</code> loop packs three things into one line:
          an initializer, a continuation condition, and an update step.
          Use it whenever you know the count up front.
        </p>

        <CodeBlock code={`for (int i = 0; i < 10; i++) {
  analogWrite(9, i * 25);
  delay(50);
}`} />
      </Section>

      <Section title="switch">
        <p className="text-sm leading-relaxed">
          Dispatches on the value of an integer-like expression. Don't
          forget the <code>break</code> at the end of each case, or
          execution "falls through" into the next one.
        </p>

        <CodeBlock code={`switch (mode) {
  case 0:
    Serial.println("off");
    break;
  case 1:
    Serial.println("slow");
    break;
  case 2:
    Serial.println("fast");
    break;
  default:
    Serial.println("unknown");
    break;
}`} />
      </Section>

      <Section title="break and continue">
        <p className="text-sm leading-relaxed">
          Inside a loop, <code>break</code> exits the loop entirely, and{" "}
          <code>continue</code> skips to the next iteration. Use them
          sparingly — they can make loops hard to follow.
        </p>

        <CodeBlock code={`for (int i = 0; i < 100; i++) {
  if (i == 50) break;      // stop completely at 50
  if (i % 2 == 0) continue; // skip even numbers
  Serial.println(i);
}`} />
      </Section>

      <SeeAlso
        refs={[
          "programming/functions",
          "programming/operators",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── Flowchart diagram ──────────────────────────────────────────────────

function FlowchartDiagram() {
  const w = 420
  const h = 280
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
        {/* Start */}
        <rect x={170} y={10} width={80} height={30} rx={15} fill="#0f0f0f" stroke="#9ca3af" strokeWidth={1.5} />
        <text x={210} y={30} textAnchor="middle" fontSize={12} fill="#d1d5db" fontFamily={mono}>start</text>

        {/* Arrow */}
        <line x1={210} y1={40} x2={210} y2={60} stroke="#6b7280" strokeWidth={1.5} />
        <polyline points="205,55 210,60 215,55" fill="none" stroke="#6b7280" strokeWidth={1.5} />

        {/* Diamond */}
        <polygon points="210,60 310,115 210,170 110,115" fill="#0f0f0f" stroke="#f59e0b" strokeWidth={2} />
        <text x={210} y={110} textAnchor="middle" fontSize={12} fill="#d1d5db" fontFamily={mono}>x &gt; 10</text>
        <text x={210} y={128} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>?</text>

        {/* True branch */}
        <text x={320} y={110} fontSize={10} fill="#10b981" fontFamily={mono}>true</text>
        <line x1={310} y1={115} x2={360} y2={115} stroke="#6b7280" strokeWidth={1.5} />
        <line x1={360} y1={115} x2={360} y2={195} stroke="#6b7280" strokeWidth={1.5} />
        <polyline points="355,190 360,195 365,190" fill="none" stroke="#6b7280" strokeWidth={1.5} />
        <rect x={310} y={195} width={100} height={30} rx={3} fill="#0f0f0f" stroke="#10b981" strokeWidth={2} />
        <text x={360} y={215} textAnchor="middle" fontSize={11} fill="#d1d5db" fontFamily={mono}>bright()</text>

        {/* False branch */}
        <text x={55} y={110} fontSize={10} fill="#ef4444" fontFamily={mono}>false</text>
        <line x1={110} y1={115} x2={60} y2={115} stroke="#6b7280" strokeWidth={1.5} />
        <line x1={60} y1={115} x2={60} y2={195} stroke="#6b7280" strokeWidth={1.5} />
        <polyline points="55,190 60,195 65,190" fill="none" stroke="#6b7280" strokeWidth={1.5} />
        <rect x={10} y={195} width={100} height={30} rx={3} fill="#0f0f0f" stroke="#ef4444" strokeWidth={2} />
        <text x={60} y={215} textAnchor="middle" fontSize={11} fill="#d1d5db" fontFamily={mono}>dim()</text>

        {/* Join */}
        <line x1={60} y1={225} x2={60} y2={255} stroke="#6b7280" strokeWidth={1.5} />
        <line x1={360} y1={225} x2={360} y2={255} stroke="#6b7280" strokeWidth={1.5} />
        <line x1={60} y1={255} x2={360} y2={255} stroke="#6b7280" strokeWidth={1.5} />
        <line x1={210} y1={255} x2={210} y2={270} stroke="#6b7280" strokeWidth={1.5} />
        <polyline points="205,265 210,270 215,265" fill="none" stroke="#6b7280" strokeWidth={1.5} />
      </svg>
    </div>
  )
}

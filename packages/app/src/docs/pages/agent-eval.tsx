import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function AgentEvalPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Agent Eval"
        subtitle="Automated evaluation system for debugging and improving agent performance."
        badge={<Badge variant="implemented">Implemented</Badge>}
      />

      <Section title="Dashboard">
        <p className="text-sm text-foreground leading-relaxed">
          The eval dashboard is served by the API server at:
        </p>
        <CodeBlock code="http://localhost:4111/api/eval/dashboard" />
        <p className="text-sm text-muted-foreground mt-2">
          Click <strong className="text-foreground">Refresh</strong> to evaluate all runs in <code>data/runs/</code>.
          Results are written to <code>data/tests/</code> with one JSON file per run plus a <code>summary.json</code>.
        </p>
      </Section>

      <Section title="Scoring (0-100)">
        <Table
          headers={["Category", "Points", "What it measures"]}
          rows={[
            ["Accuracy", "0-25", "Tool call success rate. Errors, hallucinated IDs, wrong pin names reduce score."],
            ["Efficiency", "0-25", "Token waste ratio. Unnecessary get_board_state calls, retried tool calls, 0-op runs penalized."],
            ["Quality", "0-25", "Circuit correctness. Floating components, bus shorts, missing resistors, sketch/pin mismatch reduce score."],
            ["Completeness", "0-25", "Did the agent finish? Components placed (+10), wires created (+5), all connected (+5). Hallucinations reduce."],
          ]}
        />
      </Section>

      <Section title="Path trace">
        <p className="text-sm text-foreground leading-relaxed mb-2">
          Every tool call is recorded in order with full input and output. The trace shows the
          agent's decision path from start to finish.
        </p>
        <CodeBlock lang="text" code={`Step 1: [TOOL CALL]   propose_circuit({components: [...], wires: [...]})
Step 2: [TOOL RESULT] ✓ {success: true, componentsPlaced: 3, wiresCreated: 4}
Step 3: [TEXT]         "Done! I've created a traffic light circuit..."

Or for a failed run:
Step 1: [TOOL CALL]   place_component({type: "led", x: 18, y: 10})
Step 2: [TOOL RESULT] ✗ {error: "Position out of bounds"}
Step 3: [TOOL CALL]   place_component({type: "led", x: 2, y: 5})   ← RETRY
Step 4: [TOOL RESULT] ✓ {componentId: "abc-123"}
Step 5: [TOOL CALL]   wire_component_to_pin({componentId: "fake-id"})
Step 6: [TOOL RESULT] ✗ {error: "Component not found"}              ← HALLUCINATION`} />
        <p className="text-sm text-muted-foreground mt-2">
          The dashboard color-codes steps: green for success, red for errors, orange for hallucinations.
          Retries are detected when the same tool is called again after an error.
        </p>
      </Section>

      <Section title="Token analysis">
        <Table
          headers={["Metric", "Description"]}
          rows={[
            ["Model", "Which Claude model was used (sonnet-4-6, haiku-4-5, or template)"],
            ["Input/output tokens", "Raw token counts from the API response"],
            ["Estimated cost", "USD cost based on model pricing"],
            ["Wasted tokens", "Tokens spent on unnecessary get_board_state calls, retries, or 0-op runs"],
          ]}
        />
      </Section>

      <Section title="Tool accuracy">
        <Table
          headers={["Check", "What triggers it"]}
          rows={[
            ["Error rate", "% of tool calls that returned an error object"],
            ["Hallucinated IDs", "Agent used a component/wire ID that doesn't exist (e.g., 'potentiometer_id' instead of a UUID)"],
            ["Wrong pin names", "Agent used 'Anode' instead of 'anode', or 'pin1' instead of 'a'"],
            ["Invalid positions", "Component placed at x > 9 or y > 29 (off the breadboard)"],
          ]}
        />
      </Section>

      <Section title="Circuit quality">
        <Table
          headers={["Check", "What it detects"]}
          rows={[
            ["Floating components", "Components with no wires connected to their grid position"],
            ["Bus shorts", "Multiple Arduino pin wires (signal + power/GND) landing on the same row and strip"],
            ["Missing resistors", "LEDs without a resistor in the cathode row"],
            ["Sketch/pin mismatch", "Sketch uses a pin number that has no wire connecting to the breadboard"],
          ]}
        />
      </Section>

      <Section title="API endpoints">
        <Table
          headers={["Method", "Path", "Description"]}
          rows={[
            ["GET", "/api/eval/dashboard", "HTML dashboard (open in browser)"],
            ["GET", "/api/eval/summary", "Aggregate stats across all evaluated runs"],
            ["GET", "/api/eval/run/:id", "Per-run eval with full trace, scores, and issues"],
            ["GET", "/api/eval/all", "All run evals as a JSON array (re-evaluates first)"],
            ["POST", "/api/eval/refresh", "Re-evaluate all runs and regenerate summary"],
          ]}
        />
      </Section>

      <Section title="Data storage">
        <CodeBlock lang="text" code={`packages/api/data/
  runs/                   ← Raw agent run data (existing)
    {runId}.json

  tests/                  ← Eval results (generated)
    {runId}.json          ← Per-run eval (score, trace, issues)
    summary.json          ← Aggregate stats`} />
        <Note>
          Eval files are auto-generated — you can delete <code>data/tests/</code> and click Refresh
          on the dashboard to regenerate everything from the raw run data.
        </Note>
      </Section>

      <Section title="Auto-eval">
        <p className="text-sm text-foreground leading-relaxed">
          Every agent run is automatically evaluated when it completes. The eval is written to{" "}
          <code>data/tests/&#123;runId&#125;.json</code> as a fire-and-forget background task. No
          manual refresh needed for new runs — just open the dashboard.
        </p>
      </Section>
    </DocsLayout>
  )
}

import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn, CodeBlock } from "@/docs/docs-layout"

export function AiAgentPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="AI Agent"
        subtitle="Three ways to bring AI into Breadbox — the built-in agent on your own API key, your own Claude over MCP, or instant zero-cost templates."
        badge={<Badge variant="implemented">Implemented</Badge>}
      />

      <Section title="Three ways to use AI">
        <p className="text-sm text-foreground leading-relaxed">
          Breadbox doesn&apos;t ship a shared, metered AI. Instead you choose how the assistance reaches
          your board — each path uses the same underlying circuit model, so you can freely mix them.
        </p>
        <Table
          headers={["Way", "What it is", "Model & key", "Best for"]}
          rows={[
            ["Built-in agent", "In-app chat (✦) — describe a circuit and it places parts, draws wires, and writes the sketch", "Your own Anthropic API key (BYOK)", "Designing and editing inside Breadbox"],
            ["Your Claude over MCP", "Connect Claude Code, Claude Desktop, or Cursor; edits stream onto your open canvas live", "Your AI client's model & subscription", "Working from an assistant you already use"],
            ["Instant templates", "Keyword-matched deterministic builders for common circuits", "None — 0 tokens, <100ms", "Blink, button + LED, and other starters"],
          ]}
        />
        <Note>
          Start a board with a template, refine it with the built-in agent, then hand the project to
          your own Claude over MCP — the same project file flows through all three.
        </Note>
      </Section>

      <Section title="1. Built-in agent — bring your own API key">
        <p className="text-sm text-foreground leading-relaxed">
          Click the <strong className="text-foreground">sparkle icon</strong> (✦) in the bottom toolbar
          to switch the chat panel to AI mode. Type a request in plain language and press Enter — the
          agent reads your current board, places components, draws wires, and updates the sketch in a
          single turn.
        </p>
        <Note>
          Breadbox&apos;s built-in AI runs on <strong className="text-foreground">your own Anthropic API
          key</strong> — there is no bundled or shared key. The first time you send an AI request (in
          CLI or desktop mode) a dialog asks for a key starting with <code>sk-ant-</code>. It is saved
          to <code>~/.dreamer/config.json</code>, applied without a restart, and never leaves your
          machine except to call Anthropic. Grab one from the{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
            target="_blank"
            rel="noreferrer"
          >
            Anthropic Console
          </a>
          . If a request comes back without a key, the dialog re-opens automatically.
        </Note>
        <Warn>
          You pay Anthropic directly for built-in-agent usage at their per-token rates. The other two
          paths don&apos;t touch your key: templates run no model at all, and MCP bills against your own
          AI client&apos;s subscription.
        </Warn>
      </Section>

      <Section title="What the built-in agent can do">
        <Table
          headers={["Capability", "Example prompt"]}
          rows={[
            ["Build complete circuits", '"Build a potentiometer-controlled servo"'],
            ["Place components", '"Add an LED on the breadboard"'],
            ["Update components", '"Change the LED color to blue" / "Change resistance to 330"'],
            ["Move components", '"Move the button to row 10"'],
            ["Remove components", '"Remove the servo"'],
            ["Edit wires", '"Remove the wire from pin 13"'],
            ["Write/edit sketch code", '"Write a blink sketch" / "Change the delay to 500ms"'],
            ["Validate wiring", '"Check if my circuit is correct"'],
            ["Visual programming", '"Set up a visual blink program using node blocks"'],
          ]}
        />
      </Section>

      <Section title="How built-in requests are routed">
        <p className="text-sm text-foreground leading-relaxed mb-2">
          Every message is classified before it spends a token. Known patterns hit a deterministic
          template (way 3); everything else goes to the Claude agent, which prefers a single{" "}
          <code>propose_circuit</code> call for new circuits and individual tools for small edits.
        </p>
        <Table
          headers={["Path", "When", "Cost", "Latency"]}
          rows={[
            ["Template", "Known patterns: blink, button+LED, servo sweep, traffic light, pot+LED, temperature, buzzer", "0 tokens", "<100ms"],
            ["Agent (propose_circuit)", "New circuits described in natural language", "1,500-3,000 tokens", "3-8s"],
            ["Agent (individual tools)", "Small edits: move, rename, change color, add one component", "500-1,500 tokens", "2-5s"],
          ]}
        />
      </Section>

      <Section title="2. Your own Claude over MCP">
        <p className="text-sm text-foreground leading-relaxed">
          Breadbox ships a <a href="https://modelcontextprotocol.io/" className="text-blue-700 underline underline-offset-2 hover:text-blue-900" target="_blank" rel="noreferrer">Model Context Protocol</a> server
          (<code>dreamer mcp</code>) that exposes its circuit tools to your own Claude — Claude Code,
          Claude Desktop, Cursor, or any MCP client. The model and subscription are yours, and edits
          appear on your open Breadbox canvas in real time as each tool call lands — no import, no reload.
        </p>
        <p className="text-sm text-foreground leading-relaxed mt-2 mb-2">
          Register the server with Claude Code:
        </p>
        <CodeBlock lang="bash" code={`claude mcp add dreamer -- dreamer --project <id> mcp`} />
        <p className="text-sm text-foreground leading-relaxed mt-3 mb-2">
          …or add it to Claude Desktop&apos;s <code>claude_desktop_config.json</code>:
        </p>
        <CodeBlock lang="json" code={`{
  "mcpServers": {
    "dreamer": {
      "command": "dreamer",
      "args": ["--project", "<id>", "mcp"]
    }
  }
}`} />
        <Table
          headers={["MCP tool", "Purpose"]}
          rows={[
            ["validate_design", "Dry-run check a diagram (no writes) — run before applying"],
            ["apply_design", "Atomically replace the board with a diagram (+ sketch)"],
            ["get_board_state / list_components / list_wires", "Read the current board"],
            ["update_sketch / patch_sketch", "Replace the sketch, or patch a line range"],
            ["analyze_power_budget", "Per-pin / rail load + electrical-safety report"],
            ["get_wiring_guide", "Wire colours, rules, footprints, pin aliases"],
          ]}
        />
        <Note>
          Get the project id from the in-app <strong className="text-foreground">Connect Claude (MCP)</strong> dialog
          (<code>Cmd/Ctrl+K</code> → &quot;Connect Claude&quot;), which shows ready-to-copy commands. The live
          canvas bridge is a <strong className="text-foreground">local</strong> feature — it is disabled on the
          hosted deployment.
        </Note>
      </Section>

      <Section title="3. Instant templates — no AI, no key">
        <p className="text-sm text-foreground leading-relaxed mb-2">
          Common requests are matched by keyword before any model runs, then built by deterministic code
          that places components with correct wiring and a working sketch. They cost nothing, finish in
          under 100ms, and need no API key.
        </p>
        <Table
          headers={["Template", "Trigger", "Builds"]}
          rows={[
            ["Blink", '"blink LED", "make an LED blink"', "LED + 220Ω resistor"],
            ["Button + LED", '"button LED", "button-controlled LED"', "Button + LED + 220Ω resistor"],
            ["Servo sweep", '"servo sweep"', "Servo motor"],
            ["Traffic light", '"traffic light"', "3 LEDs (R/Y/G) + 3 resistors"],
            ["Pot + LED brightness", '"potentiometer LED", "pot brightness"', "Potentiometer + LED + resistor"],
            ["Temperature reading", '"temperature sensor", "temp reading"', "TMP36 sensor"],
            ["Buzzer tone", '"buzzer", "tone", "melody"', "Piezo buzzer"],
          ]}
        />
        <Note>
          Templates clear the existing board by default. Words like &quot;add&quot;, &quot;also&quot;, or
          &quot;another&quot; keep what&apos;s there — &quot;also add a buzzer&quot; preserves the board.
        </Note>
      </Section>

      <Section title="Limitations">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Built-in agent: build / place / move / update / wire / sketch", "Implemented"],
            ["Instant templates (blink, traffic light, …)", "Implemented — 7 templates"],
            ["MCP live canvas bridge", "Implemented — local only (dev server, CLI, or desktop)"],
            ["Bring-your-own Anthropic key", "Implemented — stored at ~/.dreamer/config.json"],
            ["Read simulation results (voltage, current)", "Not implemented — the agent can't read SPICE output"],
            ["Run/stop sketch from chat", "Not implemented — click Run manually"],
            ["Read serial output", "Not implemented"],
            ["MCP live bridge on the hosted deployment", "Not available — local only"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

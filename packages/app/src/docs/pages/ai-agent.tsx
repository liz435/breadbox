import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn, CodeBlock } from "@/docs/docs-layout"

export function AiAgentPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="AI Agent"
        subtitle="Chat-based assistant that designs circuits, places components, writes sketch code, and validates wiring."
        badge={<Badge variant="implemented">Implemented</Badge>}
      />

      <Section title="How to use">
        <p className="text-sm text-gray-300 leading-relaxed">
          Click the <strong className="text-gray-200">sparkle icon</strong> (✦) in the bottom toolbar
          to switch to AI mode. Type a request in natural language and press Enter. The agent reads
          your board state, places components, draws wires, and updates the sketch — all in one step.
        </p>
        <Note>
          Common requests (blink, button+LED, servo sweep, traffic light, etc.) are handled by
          instant templates — zero AI cost, &lt;100ms. Complex requests use the full agent.
        </Note>
      </Section>

      <Section title="Request routing">
        <Table
          headers={["Path", "When", "Cost", "Latency"]}
          rows={[
            ["Template", "Known patterns: blink, button+LED, servo sweep, traffic light, pot+LED, temperature, buzzer", "0 tokens", "<100ms"],
            ["Agent (propose_circuit)", "New circuits described in natural language", "1,500-3,000 tokens", "3-8s"],
            ["Agent (individual tools)", "Small edits: move, rename, change color, add one component", "500-1,500 tokens", "2-5s"],
          ]}
        />
      </Section>

      <Section title="What the agent can do">
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

      <Section title="Agent tools">
        <Table
          headers={["Tool", "What it does"]}
          rows={[
            ["propose_circuit", "Build an entire circuit in one call — components, wires, and sketch. Auto-positions everything. Preferred for new circuits."],
            ["get_board_state", "Read current components, wires, and sketch code"],
            ["get_wiring_guide", "Reference: breadboard bus rules, pin names, footprints"],
            ["place_component", "Place a single component (22 types available)"],
            ["update_component", "Change a component's name, pins, or properties"],
            ["move_component", "Reposition a component on the breadboard"],
            ["remove_component", "Delete a component (warns about orphaned wires)"],
            ["connect_wire", "Draw a wire between two breadboard points"],
            ["wire_component_to_pin", "High-level: wire a component to an Arduino pin by component ID"],
            ["remove_wire", "Delete a wire by ID"],
            ["update_wire", "Move a wire endpoint"],
            ["update_sketch", "Replace the entire sketch code"],
            ["patch_sketch", "Edit specific lines without replacing the whole file"],
            ["create_blink_circuit", "Deterministic: LED + resistor + sketch"],
            ["create_button_led_circuit", "Deterministic: button + LED + resistor + sketch"],
            ["create_servo_sweep_circuit", "Deterministic: servo + Servo library sketch"],
          ]}
        />
      </Section>

      <Section title="Templates (instant, zero cost)">
        <p className="text-sm text-gray-300 leading-relaxed mb-2">
          These patterns are detected by keyword matching before the AI agent runs. They execute
          deterministic circuit builders that place components with correct wiring and working sketch code.
        </p>
        <Table
          headers={["Template", "Trigger", "Components"]}
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
          Templates clear the existing board by default. Use words like "add", "also", or "another"
          to keep existing components: "also add a buzzer" preserves the board.
        </Note>
      </Section>

      <Section title="propose_circuit (recommended for new circuits)">
        <p className="text-sm text-gray-300 leading-relaxed mb-2">
          The agent describes components and wires by type and array index — the tool handles
          positioning, ID generation, and validation automatically. No hallucinated IDs possible.
        </p>
        <CodeBlock lang="json" code={`// Agent calls propose_circuit with:
{
  "components": [
    {"type": "led", "name": "LED", "properties": {"color": "#ef4444"}},
    {"type": "resistor", "name": "R1", "properties": {"resistance": 220}}
  ],
  "wires": [
    {"arduinoPin": 13, "toComponent": 0}
  ],
  "ledResistorPairs": [
    {"ledIndex": 0, "resistorIndex": 1}
  ],
  "sketch": "void setup() { ... }"
}`} />
        <p className="text-sm text-gray-400 mt-2">
          Components are referenced by array index (0, 1, 2...), not by ID. The tool auto-positions
          them on the breadboard, wires LED cathodes through resistors to GND, and validates everything
          before placing.
        </p>
      </Section>

      <Section title="Agent eval dashboard">
        <p className="text-sm text-gray-300 leading-relaxed">
          Every agent run is automatically evaluated for accuracy, efficiency, circuit quality, and
          completeness. Results are stored in <code>data/tests/</code> alongside the run data.
        </p>
        <Table
          headers={["Metric", "What it measures"]}
          rows={[
            ["Path trace", "Full execution sequence: every tool call, input, result, in order"],
            ["Token cost", "Input/output tokens, estimated USD cost, waste detection"],
            ["Tool accuracy", "Error rate, hallucinated IDs, wrong pin names, invalid positions"],
            ["Circuit quality", "Floating components, bus shorts, missing resistors, sketch/pin match"],
            ["Score", "0-100 composite: accuracy (25) + efficiency (25) + quality (25) + completeness (25)"],
          ]}
        />
        <Note>
          Access the dashboard at <code>http://localhost:4111/api/eval/dashboard</code> when
          the API server is running. Click "Refresh" to evaluate all runs.
        </Note>
      </Section>

      <Section title="Architecture">
        <Table
          headers={["Component", "Role"]}
          rows={[
            ["Intent classifier", "Regex-based router: detects known patterns → template, or freeform → agent"],
            ["Circuit templates", "7 deterministic builders: blink, button+LED, servo, traffic light, pot+LED, temperature, buzzer"],
            ["Core agent (Claude)", "Multi-step reasoning with tools. Uses propose_circuit for new circuits, individual tools for edits"],
            ["Circuit specialist", "Delegated agent for validation and complex wiring analysis"],
            ["Graph specialist", "Delegated agent for visual node-block programming"],
            ["Board state tracker", "Server-side working copy so the agent sees current-turn changes"],
            ["Auto-eval", "Every completed run is scored automatically for debugging"],
          ]}
        />
      </Section>

      <Section title="Limitations">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Build circuits (propose_circuit)", "Implemented — auto-positions, validates, wires"],
            ["Place / remove / move / update components", "Implemented"],
            ["Draw and edit wires", "Implemented"],
            ["Write and patch sketch code", "Implemented"],
            ["Circuit validation", "Implemented — missing resistors, pin conflicts, bus shorts"],
            ["Template shortcuts (blink, traffic light, etc.)", "Implemented — 7 templates, instant"],
            ["Agent eval dashboard", "Implemented — http://localhost:4111/api/eval/dashboard"],
            ["Read simulation results (voltage, current)", "Not implemented — agent can't read SPICE output"],
            ["Run/stop sketch from chat", "Not implemented — user must click Run manually"],
            ["Read serial output", "Not implemented"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

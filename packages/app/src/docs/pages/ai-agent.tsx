import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function AiAgentPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="AI Agent"
        subtitle="Chat-based assistant that can design circuits, place components, and write sketch code."
        badge={<Badge variant="implemented">Implemented</Badge>}
      />

      <Section title="How to use">
        <p className="text-sm text-gray-300 leading-relaxed">
          Click the <strong className="text-gray-200">sparkle icon</strong> (✦) in the bottom toolbar
          to switch to AI mode. Type a request in natural language and press Enter. The agent reads
          your board state, places components, draws wires, and updates the sketch — all in one step.
        </p>
        <Note>
          The agent uses <code>claude-sonnet-4-6</code>. It has full read/write access to your board
          layout and sketch code. All changes can be undone with ⌘Z.
        </Note>
      </Section>

      <Section title="What the agent can do">
        <Table
          headers={["Capability", "Example prompt"]}
          rows={[
            ["Place components", '"Add an LED on row 5 and a 220Ω resistor"'],
            ["Remove components", '"Remove the servo"'],
            ["Draw wires", '"Connect pin 13 to the LED anode"'],
            ["Assign Arduino pins", '"Assign pin 2 to the button"'],
            ["Write sketch code", '"Write a blink sketch for the LED on pin 13"'],
            ["Suggest complete circuits", '"Build a button-controlled LED circuit"'],
            ["Validate wiring", '"Check if my circuit is correct"'],
            ["List available components", '"What components are available?"'],
            ["Delegate to circuit specialist", '"Design a temperature monitoring circuit"'],
            ["Delegate to graph specialist", '"Set up a visual blink program"'],
          ]}
        />
      </Section>

      <Section title="Agent tools">
        <Table
          headers={["Tool", "What it does"]}
          rows={[
            ["get_board_state", "Read all components, wires, pin states, and current sketch code"],
            ["place_component", "Place a component on the breadboard at a specific position"],
            ["remove_component", "Delete a component by ID"],
            ["connect_wire", "Draw a wire between two breadboard grid coordinates"],
            ["update_sketch", "Overwrite the sketch with new code"],
            ["get_sketch", "Read the current sketch code"],
            ["suggest_circuit", "Auto-detect components from a description and place them"],
            ["validate_wiring", "Check for missing resistors, wrong pin types, sketch mismatches"],
            ["list_available_components", "Return all component types with pin info and typical values"],
          ]}
        />
      </Section>

      <Section title="Example prompts">
        <CodeBlock lang="text" code={`// Basic LED blink
"Build a simple LED blink circuit on pin 13"

// Button + LED
"Add a button on pin 2 that turns on the LED on pin 13 when pressed"

// Servo sweep
"Create a servo sweep circuit on pin 9 and write the code"

// Validate
"Check my circuit for missing resistors or wiring errors"

// Sensor reading
"Add a temperature sensor and write code to print the reading to Serial"

// Complex
"Build a Simon Says game with 4 colored LEDs and 4 buttons"`} />
      </Section>

      <Section title="Limitations">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Place / remove components", "Implemented"],
            ["Draw wires", "Implemented"],
            ["Write sketch code", "Implemented"],
            ["Circuit validation (missing resistors, bad pins)", "Implemented"],
            ["Circuit suggestion from description", "Implemented"],
            ["Read sensor output / simulation results", "Partially — analogRead works from circuit voltages, but agent can't read simulation state directly"],
            ["Execute sketch", "Implemented in browser — but agent can't trigger run or read Serial output"],
            ["Read schematic or graph state", "Not implemented"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

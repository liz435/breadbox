import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn } from "@/docs/docs-layout"

export function GraphPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Visual Programming"
        subtitle="Node-graph editor for building Arduino logic without writing code."
        badge={<Badge variant="partial">Partial — UI implemented, evaluation pending</Badge>}
      />

      <Section title="Overview">
        <p className="text-sm text-gray-300 leading-relaxed">
          The Graph panel lets you connect blocks (nodes) to build Arduino logic visually. Nodes
          represent Arduino functions like <code>digitalWrite</code>, <code>analogRead</code>,
          <code>delay</code>, and control flow like <code>if/else</code>. You connect ports with edges
          to wire data and execution flow.
        </p>
        <Warn>
          <strong>Node evaluation is not yet implemented.</strong> You can place and connect nodes,
          but they do not execute or produce sketch code yet. The graph UI and persistence are fully functional.
        </Warn>
      </Section>

      <Section title="Adding nodes">
        <p className="text-sm text-gray-300 leading-relaxed">
          Right-click the graph canvas (or use the search palette) to add a node. Type to fuzzy-search
          by name or keyword. Connect ports by dragging from an output port to an input port.
          Delete nodes with <kbd className="bg-[#222] px-1 rounded text-xs">Delete</kbd> or <kbd className="bg-[#222] px-1 rounded text-xs">Backspace</kbd>.
        </p>
      </Section>

      <Section title="Structure nodes">
        <Table
          headers={["Node", "Description"]}
          rows={[
            ["Setup", "Runs once at startup — equivalent to Arduino's setup() function"],
            ["Loop", "Runs repeatedly — equivalent to Arduino's loop() function"],
          ]}
        />
        <Note>Every graph should start with a Setup and/or Loop node as entry points.</Note>
      </Section>

      <Section title="Digital / Analog I/O">
        <Table
          headers={["Node", "Inputs", "Outputs", "Arduino equivalent"]}
          rows={[
            ["Pin Mode", "flow, pin, mode (INPUT/OUTPUT/INPUT_PULLUP)", "flow", "pinMode(pin, mode)"],
            ["Digital Write", "flow, pin, value (HIGH/LOW)", "flow", "digitalWrite(pin, value)"],
            ["Digital Read", "flow, pin", "flow, digital (HIGH/LOW)", "digitalRead(pin)"],
            ["Analog Write (PWM)", "flow, pin, value (0–255)", "flow", "analogWrite(pin, value)"],
            ["Analog Read", "flow, pin", "flow, value (0–1023)", "analogRead(pin)"],
          ]}
        />
      </Section>

      <Section title="Time">
        <Table
          headers={["Node", "Inputs", "Outputs", "Arduino equivalent"]}
          rows={[
            ["Delay", "flow, milliseconds", "flow", "delay(ms)"],
            ["Millis", "flow", "flow, integer (ms)", "millis()"],
            ["Micros", "flow", "flow, integer (µs)", "micros()"],
          ]}
        />
      </Section>

      <Section title="Communication">
        <Table
          headers={["Node", "Inputs", "Outputs", "Arduino equivalent"]}
          rows={[
            ["Serial Begin", "flow, baud rate", "flow", "Serial.begin(baud)"],
            ["Serial Print", "flow, data", "flow", "Serial.print(data)"],
            ["Serial Read", "flow", "flow, byte", "Serial.read()"],
          ]}
        />
      </Section>

      <Section title="Control flow">
        <Table
          headers={["Node", "Inputs", "Outputs", "Notes"]}
          rows={[
            ["If / Else", "flow, condition (boolean)", "flow (true), flow (false)", "Branches execution based on a boolean"],
            ["Comparison", "value A, value B, operator (==, <, >, <=, >=)", "boolean", "Produces a boolean for If/Else"],
            ["Logic Gate", "bool A, bool B, operator (AND, OR, NOT)", "boolean", "Combine boolean conditions"],
          ]}
        />
      </Section>

      <Section title="Math and data">
        <Table
          headers={["Node", "Inputs", "Outputs", "Notes"]}
          rows={[
            ["Math", "a, b, operator (+, −, ×, ÷)", "result", "Basic arithmetic"],
            ["Map Value", "value, inMin, inMax, outMin, outMax", "mapped value", "Remap a range — e.g. 0–1023 → 0–180"],
            ["Constrain", "value, min, max", "constrained value", "Clamp a value within bounds"],
            ["Variable", "write port, flow", "read port, flow", "Store and retrieve a named value"],
            ["Constant", "(none)", "value", "A fixed literal number or boolean"],
          ]}
        />
      </Section>

      <Section title="Actuators and displays">
        <Table
          headers={["Node", "Inputs", "Outputs", "Notes"]}
          rows={[
            ["Servo Write", "flow, pin, angle (0–180)", "flow", "Requires Servo library and PWM pin"],
            ["Tone", "flow, pin, frequency (Hz)", "flow", "Generates square-wave tone via tone(pin, freq)"],
            ["LCD Print", "flow, row, col, text", "flow", "Prints text on LCD 16×2"],
            ["Code Block", "entry flow", "exit flow", "Embed raw C++/Arduino code inline"],
          ]}
        />
      </Section>

      <Section title="Implementation status">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Node placement and search", "Implemented"],
            ["Port connection (edges)", "Implemented"],
            ["Node copy / paste", "Implemented"],
            ["Node evaluation / execution", "Not implemented"],
            ["Graph → Sketch code export", "Not implemented"],
            ["Graph → hardware simulation link", "Not implemented"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

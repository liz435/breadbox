import { DocsLayout, PageTitle, Section, Table, CodeBlock, Note } from "@/docs/docs-layout"

export function OverviewPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Dreamer"
        subtitle="An Arduino circuit simulator and visual programming environment."
      />

      <Section title="What is Dreamer?">
        <p className="text-sm text-gray-300 leading-relaxed">
          Dreamer is a browser-based Arduino simulator. You place components on a virtual breadboard,
          wire them to an Arduino Uno, run real SPICE circuit analysis to see voltages and currents,
          write or auto-generate Arduino sketch code, and use a visual node-graph for programming logic.
          An AI agent can help you design circuits, place components, and write code.
        </p>
      </Section>

      <Section title="Panels">
        <Table
          headers={["Panel", "Purpose"]}
          rows={[
            ["Breadboard", "Place and wire components on a virtual breadboard connected to an Arduino Uno."],
            ["Sketch Editor", "Write or edit the Arduino .ino sketch. Auto-generated from your board layout when empty."],
            ["Graph", "Visual node-graph programming. Connect blocks to build logic without typing code."],
            ["Schematic", "Auto-generated IEEE circuit schematic from your breadboard wiring."],
            ["Inspector", "Edit the selected component's pins, properties, and settings."],
            ["Pin Inspector", "View the current state of all 20 Arduino pins (mode, digital value, PWM, analog)."],
            ["Serial Monitor", "Serial output viewer. Not yet connected to a runtime — placeholder only."],
            ["Project", "File browser for your scenes and project assets."],
          ]}
        />
        <Note>
          Panels can be dragged, rearranged, and resized. The layout is saved automatically per project.
        </Note>
      </Section>

      <Section title="Keyboard Shortcuts">
        <Table
          headers={["Shortcut", "Action"]}
          rows={[
            ["⌘Z / Ctrl+Z", "Undo (breadboard + scene)"],
            ["⌘⇧Z / Ctrl+Shift+Z", "Redo"],
            ["Delete / Backspace", "Remove selected component or wire"],
            ["Escape", "Deselect all"],
            ["Space + Drag", "Pan the breadboard canvas"],
            ["Scroll", "Zoom the breadboard canvas"],
          ]}
        />
      </Section>

      <Section title="Workflow">
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>Open the <strong className="text-gray-200">Breadboard</strong> panel and pick a component from the palette.</li>
          <li>Click a hole to place the component. Use the <strong className="text-gray-200">Inspector</strong> to assign Arduino pins.</li>
          <li>Draw wires between component legs and the Arduino power/ground rails.</li>
          <li>The <strong className="text-gray-200">Circuit Simulator</strong> runs automatically — LEDs glow, the schematic updates.</li>
          <li>Open the <strong className="text-gray-200">Sketch Editor</strong> — a boilerplate sketch is auto-generated. Edit it freely.</li>
          <li>Use the <strong className="text-gray-200">AI Agent</strong> (bottom toolbar → sparkle icon) to ask for help at any step.</li>
        </ol>
      </Section>

      <Section title="Auto-generated Sketch">
        <p className="text-sm text-gray-400 mb-2">
          When the sketch is empty or contains only auto-generated code, Dreamer regenerates it whenever you
          change the board layout. Once you manually edit the sketch, auto-generation stops.
        </p>
        <CodeBlock code={`// Auto-generated from board layout
// Modify this sketch to add your own logic.

void setup() {
  Serial.begin(9600);
  pinMode(13, OUTPUT); // LED1
  pinMode(2, INPUT_PULLUP); // Button1
}

void loop() {
  digitalWrite(13, HIGH);
  delay(100);
}`} />
      </Section>
    </DocsLayout>
  )
}

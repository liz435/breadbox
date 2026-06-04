import { DocsLayout, PageTitle, Section, Table, CodeBlock, Note } from "@/docs/docs-layout"

export function OverviewPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Breadbox"
        subtitle="An Arduino circuit simulator and visual programming environment."
      />

      <Section title="What is Breadbox?">
        <p className="text-sm text-gray-300 leading-relaxed">
          Breadbox is a browser-based Arduino simulator. You place components on a virtual breadboard,
          wire them to an Arduino Uno, run real SPICE circuit analysis to see voltages and currents,
          write and execute Arduino sketches in the browser, and use a visual node-graph for programming logic.
          An AI agent can help you design circuits, place components, and write code.
        </p>
      </Section>

      <Section title="Panels">
        <Table
          headers={["Panel", "Purpose"]}
          rows={[
            ["Breadboard", "Place and wire components on a virtual breadboard connected to an Arduino Uno. Search the palette by name or category. Drag wire endpoints to reposition them."],
            ["Sketch Editor", "Write, edit, and run Arduino sketches. Auto-generated from board layout when empty. Includes Run/Stop controls and an Examples button with 21 ready-made boards."],
            ["Graph", "Visual node-graph programming. Connect blocks to build logic without typing code."],
            ["Schematic", "Auto-generated IEEE circuit schematic. Click components to select them on the breadboard."],
            ["Libraries", "Manage custom Arduino libraries and browse the official Arduino Library Index (~7,000 libraries). 10 built-in JS-shimmed libraries work in transpile mode."],
            ["Inspector", "Edit the selected component's pins, properties, and settings."],
            ["Pin Inspector", "View the current state of all 20 Arduino pins (mode, digital value, PWM, analog)."],
            ["Serial Monitor", "Bidirectional serial communication. Works with both simulated sketches and real Arduino via Web Serial."],
            ["Project", "File browser for your scenes and project assets."],
          ]}
        />
        <Note>
          Panels can be dragged, rearranged, and resized. Toggle panels via the toolbar buttons.
          The layout is saved automatically.
        </Note>
      </Section>

      <Section title="Keyboard Shortcuts">
        <Table
          headers={["Shortcut", "Action"]}
          rows={[
            ["⌘K / Ctrl+K", "Open command palette — search components, panels, and actions"],
            ["⌘S / Ctrl+S", "Save project immediately"],
            ["⌘Z / Ctrl+Z", "Undo (breadboard + scene)"],
            ["⌘⇧Z / Ctrl+Shift+Z", "Redo"],
            ["⌘F / Ctrl+F", "Find in sketch editor"],
            ["R", "Rotate selected component (or rotate while placing)"],
            ["Delete / Backspace", "Remove selected component or wire"],
            ["Escape", "Deselect / cancel placement / cancel wire drag"],
            ["Space + Drag", "Pan the breadboard canvas"],
            ["Scroll", "Zoom the breadboard canvas"],
            ["Tab", "Accept autocomplete suggestion in sketch editor"],
            ["?", "Show keyboard shortcuts help dialog"],
          ]}
        />
      </Section>

      <Section title="Workflow">
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>Open the <strong className="text-gray-200">Breadboard</strong> panel and pick a component from the palette (search by name or category), or press <strong className="text-gray-200">⌘K</strong> to use the command palette.</li>
          <li>Click to place the component. Press <strong className="text-gray-200">R</strong> to rotate before placing. Drag to reposition.</li>
          <li>Draw wires between component legs and the Arduino power/ground rails. Select a wire and drag its endpoint handles to adjust.</li>
          <li>The <strong className="text-gray-200">Circuit Simulator</strong> runs automatically — LEDs glow, the schematic updates.</li>
          <li>Open the <strong className="text-gray-200">Sketch Editor</strong> — a boilerplate sketch is auto-generated. Edit it freely, or click <strong className="text-gray-200">Examples</strong> to load a pre-built board with a working sketch.</li>
          <li>Click <strong className="text-gray-200">Run</strong> to compile and execute the sketch in the browser. Serial output appears in the Serial Monitor.</li>
          <li>Use the <strong className="text-gray-200">AI Agent</strong> (bottom toolbar, sparkle icon) to ask for help at any step.</li>
        </ol>
      </Section>

      <Section title="Saving">
        <p className="text-sm text-gray-300 leading-relaxed">
          Projects auto-save after 2 seconds of inactivity. Press <strong className="text-gray-200">⌘S / Ctrl+S</strong> to save
          immediately — the Project icon in the toolbar flashes green to confirm. Components, wires, sketch code,
          and graph state are all persisted.
        </p>
      </Section>

      <Section title="Auto-generated Sketch">
        <p className="text-sm text-gray-400 mb-2">
          When the sketch is empty or contains only auto-generated code, Breadbox regenerates it whenever you
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

      <Section title="Serial Monitor">
        <p className="text-sm text-gray-300 leading-relaxed">
          The Serial Monitor displays output from <code>Serial.print()</code> and accepts input for <code>Serial.read()</code>.
          It works with both the in-browser simulation and real Arduino hardware via the Web Serial API (Chrome/Edge).
        </p>
        <Table
          headers={["Feature", "Details"]}
          rows={[
            ["Output", "Serial.print / println from running sketches"],
            ["Input", "Type and press Enter — feeds into Serial.read() or sends to real Arduino"],
            ["Web Serial", "Click Connect to attach a real Arduino via USB (Chrome/Edge only)"],
            ["Baud rate", "Selectable: 300 to 115200"],
            ["Line endings", "No line ending, Newline, Carriage return, or Both"],
            ["Autoscroll", "Toggle on/off"],
            ["Timestamps", "Toggle to show time before each line"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function SketchPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Sketch Editor"
        subtitle="Write, run, and debug Arduino sketches in the browser."
        badge={<Badge variant="implemented">Implemented</Badge>}
      />

      <Section title="Example boards">
        <p className="text-sm text-foreground leading-relaxed mb-2">
          The <strong className="text-foreground">Examples</strong> button sits to the right of Run/Stop
          in the toolbar. It opens a popover listing 21 ready-made example boards — one for every
          component type Breadbox supports. Each example includes a complete breadboard layout, wiring,
          and a working sketch.
        </p>
        <Table
          headers={["Feature", "Details"]}
          rows={[
            ["Context-aware", "If your board already has components, matching examples are highlighted at the top of the list."],
            ["Grouped by category", "Output, Input, Display, Passive, Other — so you can browse by purpose."],
            ["Replaces the board", "Clicking an example loads the full BoardState (components + wires + sketch). Your current board is replaced."],
            ["21 examples", "LED, RGB LED, Resistor, Capacitor, Button, Potentiometer, Buzzer, Servo, Photoresistor, Temperature Sensor, Ultrasonic Sensor, LCD 16×2, 7-Segment, NeoPixel, PIR Sensor, Relay, DC Motor, DHT Sensor, IR Receiver, Shift Register, OLED Display."],
          ]}
        />
        <Note>
          Examples are stored as JSON board snapshots in <code>packages/app/src/examples/boards/</code>.
          The catalog auto-discovers them via <code>import.meta.glob</code> — drop a new JSON file and
          add an entry in <code>example-catalog.ts</code> to ship a new example.
        </Note>
      </Section>

      <Section title="Auto-generation">
        <p className="text-sm text-foreground leading-relaxed">
          When the sketch is empty or still contains the auto-generated boilerplate, Breadbox
          regenerates it every time the board changes. Once you manually edit the code, auto-generation
          stops — your edits are preserved.
        </p>
        <Note>
          The auto-generated sketch sets up pin modes and writes basic output values.
          It does not generate sensor reading logic, conditionals, or loops beyond a 100 ms delay.
        </Note>
      </Section>

      <Section title="Execution">
        <p className="text-sm text-foreground leading-relaxed mb-2">
          Click <strong>Compile & Run</strong> (or use the play button in the toolbar) to execute
          your sketch in the browser. The transpiler converts your Arduino C++ to JavaScript and
          runs <code>setup()</code> once, then <code>loop()</code> at ~60 fps.
        </p>
        <Table
          headers={["Feature", "Details"]}
          rows={[
            ["Pin I/O", "pinMode, digitalWrite, digitalRead, analogWrite, analogRead — all functional"],
            ["Serial", "Serial.begin, .print, .println, .available, .read, .write — output appears in Serial Monitor"],
            ["Timing", "delay(), millis(), micros() — uses a virtual clock (16ms per tick, deterministic)"],
            ["Tone", "tone(pin, freq) generates real audio via Web Audio API; noTone() stops it"],
            ["Interrupts", "attachInterrupt on pins 2/3 — ISRs fire on RISING, FALLING, or CHANGE edges"],
            ["pulseIn", "pulseIn(pin, value) — returns simulated microseconds (for ultrasonic sensors)"],
            ["Shift registers", "shiftOut() and shiftIn() — bit-bang SPI on any pins"],
          ]}
        />
      </Section>

      <Section title="Supported libraries">
        <Table
          headers={["Library", "#include", "Available API"]}
          rows={[
            ["Servo", "<Servo.h>", "attach(pin), write(angle), read(), attached(), detach()"],
            ["LiquidCrystal", "<LiquidCrystal.h>", "begin(cols, rows), setCursor(col, row), print(text), clear()"],
            ["EEPROM", "<EEPROM.h>", "read(addr), write(addr, val), update(addr, val), length()"],
            ["Wire (I2C)", "<Wire.h>", "begin(), beginTransmission(), write(), endTransmission(), requestFrom(), read()"],
            ["SPI", "<SPI.h>", "begin(), transfer(data), beginTransaction(), endTransaction()"],
            ["Stepper", "<Stepper.h>", "Stepper(steps, pins...), setSpeed(rpm), step(steps)"],
            ["Adafruit NeoPixel", "<Adafruit_NeoPixel.h>", "Adafruit_NeoPixel(n, pin, type), begin(), setPixelColor(), show(), Color(), clear(), fill()"],
            ["DHT", "<DHT.h>", "DHT(pin, type), begin(), readTemperature(), readHumidity()"],
            ["IRremote", "<IRremote.h>", "IRrecv(pin), enableIRIn(), decode(&results), resume()"],
            ["Adafruit SSD1306", "<Adafruit_SSD1306.h>", "Adafruit_SSD1306(w, h, &Wire, rst), begin(), print/println(), setCursor(), clearDisplay(), display()"],
          ]}
        />
        <Note>
          Built-in libraries are provided as globals — just <code>#include &lt;Name.h&gt;</code> (angle brackets).
        </Note>
      </Section>

      <Section title="Custom libraries">
        <p className="text-sm text-foreground leading-relaxed mb-2">
          You can add your own libraries via the <strong>Libraries</strong> tab (next to Sketch/Graph/Schematic).
          Custom libraries are written in the same C++ subset the transpiler supports.
        </p>
        <Table
          headers={["Action", "How"]}
          rows={[
            ["Create a library", "Click + in the Libraries tab, name it (e.g. MyUtils.h), write code in the editor"],
            ["Upload a file", "Click the upload icon to import a .h or .cpp file from disk"],
            ["Use in your sketch", '#include "MyUtils.h" — use double quotes, not angle brackets'],
            ["Edit", "Expand the library in the Libraries tab and edit the code directly"],
            ["Delete", "Hover over the library name and click the trash icon"],
          ]}
        />
        <Note>
          Custom libraries use <code>#include &quot;name.h&quot;</code> (double quotes). Built-in libraries use{" "}
          <code>#include &lt;name.h&gt;</code> (angle brackets). Both syntaxes work for built-in libraries,
          but custom libraries must use quotes.
        </Note>
      </Section>

      <Section title="C++ subset supported">
        <Table
          headers={["Feature", "Supported?"]}
          rows={[
            ["Variable declarations (int, float, char, String, bool, byte, long)", "Yes"],
            ["Array declarations and initialization", "Yes"],
            ["Function definitions with return types", "Yes"],
            ["for/while/if/switch/do-while", "Yes"],
            ["#define → const conversion", "Yes"],
            ["Class and struct definitions (simple, no templates)", "Yes"],
            ["public:/private:/protected: access specifiers", "Yes (treated as comments)"],
            ["Pointers, references, ->", "No — transpilation error"],
            ["Templates", "No — transpilation error"],
            ["Namespaces", "No — transpilation error"],
          ]}
        />
      </Section>

      <Section title="What gets generated per component">
        <Table
          headers={["Component", "setup()", "loop()", "Global / includes"]}
          rows={[
            ["LED", "pinMode(pin, OUTPUT)", "digitalWrite(pin, HIGH)", "—"],
            ["RGB LED", "pinMode(r/g/b, OUTPUT)", "analogWrite(pin, 128) per channel", "—"],
            ["Button", "pinMode(pin, INPUT_PULLUP)", "— (no loop code)", "—"],
            ["Servo", "servo.attach(pin)", "servo.write(90)", "#include <Servo.h>, Servo servo;"],
            ["Buzzer", "pinMode(pin, OUTPUT)", "— (no loop code)", "—"],
            ["LCD 16x2", "lcd.begin(16, 2)", "lcd.print(\"Hello, World!\")", "#include <LiquidCrystal.h>"],
            ["7-Segment", "pinMode(a-g, OUTPUT)", "digitalWrite pattern for digit 0", "—"],
            ["Temperature Sensor", "// comment", "analogRead + voltage-to-temp conversion", "—"],
            ["Ultrasonic", "pinMode(trigger, OUTPUT); pinMode(echo, INPUT)", "— (comment only)", "—"],
          ]}
        />
      </Section>

      <Section title="IDE features">
        <Table
          headers={["Feature", "Details"]}
          rows={[
            ["Syntax highlighting", "VS Code Dark+ colors — keywords, types, strings, comments, functions all colored"],
            ["Autocomplete", "Arduino functions, constants, types — Tab to accept, arrow keys to navigate"],
            ["Auto-close brackets", "Typing ( [ { \" automatically inserts the closing pair"],
            ["Code folding", "Collapse setup(), loop(), if/for blocks via gutter arrows"],
            ["Search & Replace", "Cmd+F to find, Cmd+H to replace"],
            ["Indent with Tab", "Tab indents, Shift-Tab dedents selected lines"],
            ["Selection match", "Select a word — all occurrences are highlighted"],
            ["Lint warnings", "Missing setup()/loop(), wrong pin for analogWrite/analogRead"],
            ["Compilation errors", "Transpile errors shown inline as red squiggles at the exact line — auto-clear on edit"],
            ["Undo/Redo", "Cmd+Z / Cmd+Shift+Z"],
          ]}
        />
      </Section>

      <Section title="Limitations">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Sketch execution in browser", "Implemented — transpile mode"],
            ["Serial Monitor output", "Implemented — Serial.print shows in panel"],
            ["Serial Monitor input", "Implemented — Serial.read from input field or Web Serial"],
            ["analogRead from circuit voltage", "Implemented — voltage mapped to 0-1023"],
            ["Audio tone output", "Implemented — Web Audio square wave"],
            ["Code saved to project (auto-save)", "Implemented"],
            ["Custom library upload & #include", "Implemented — Libraries tab"],
            ["Web Serial (real Arduino)", "Implemented — Chrome/Edge, click Connect"],
            ["Class instantiation (Servo motor;)", "Implemented — any PascalCase class"],
            ["Potentiometer wiper position", "Partially — works via circuit solver when wired correctly"],
            ["Multi-file sketches (.h/.cpp tabs)", "Not implemented — use custom libraries instead"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

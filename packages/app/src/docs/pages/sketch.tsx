import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function SketchPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Sketch Editor"
        subtitle="Write, run, and debug Arduino sketches in the browser."
        badge={<Badge variant="implemented">Implemented</Badge>}
      />

      <Section title="Auto-generation">
        <p className="text-sm text-gray-300 leading-relaxed">
          When the sketch is empty or still contains the auto-generated boilerplate, Dreamer
          regenerates it every time the board changes. Once you manually edit the code, auto-generation
          stops — your edits are preserved.
        </p>
        <Note>
          The auto-generated sketch sets up pin modes and writes basic output values.
          It does not generate sensor reading logic, conditionals, or loops beyond a 100 ms delay.
        </Note>
      </Section>

      <Section title="Execution">
        <p className="text-sm text-gray-300 leading-relaxed mb-2">
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
          ]}
        />
        <Note>
          Libraries are provided as built-in globals — no installation needed. Just <code>#include</code> them.
          Unknown libraries will produce a transpilation error.
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
            ["analogRead from circuit voltage", "Implemented — voltage mapped to 0-1023"],
            ["Audio tone output", "Implemented — Web Audio square wave"],
            ["Code saved to project (auto-save)", "Implemented"],
            ["Potentiometer wiper position", "Not implemented — always reads 0"],
            ["Multi-file sketches (.h/.cpp tabs)", "Not implemented"],
            ["External library import", "Not implemented — built-in libraries only"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

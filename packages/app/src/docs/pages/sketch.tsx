import { DocsLayout, PageTitle, Section, Table, Badge, Note, CodeBlock } from "@/docs/docs-layout"

export function SketchPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Sketch Editor"
        subtitle="Write and edit your Arduino .ino sketch. Auto-generated from board layout."
        badge={<Badge variant="partial">Partial</Badge>}
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

      <Section title="What gets generated per component">
        <Table
          headers={["Component", "setup()", "loop()", "Global / includes"]}
          rows={[
            ["LED", "pinMode(pin, OUTPUT)", "digitalWrite(pin, HIGH)", "—"],
            ["RGB LED", "pinMode(r/g/b, OUTPUT)", "analogWrite(pin, 128) per channel", "—"],
            ["Button", "pinMode(pin, INPUT_PULLUP)", "— (no loop code)", "—"],
            ["Servo", "servo.attach(pin)", "servo.write(90)", "#include <Servo.h>, Servo servo;"],
            ["Buzzer", "pinMode(pin, OUTPUT)", "— (no loop code)", "—"],
            ["LCD 16×2", "lcd.begin(16, 2)", "lcd.print(\"Hello, World!\")", '#include <LiquidCrystal.h>, LiquidCrystal lcd(rs, en, d4, d5, d6, d7);'],
            ["Potentiometer", "— (comment only)", "— (comment only)", "—"],
            ["Photoresistor", "— (comment only)", "— (comment only)", "—"],
            ["Temperature Sensor", "— (comment only)", "— (comment only)", "—"],
            ["Ultrasonic", "pinMode(trigger, OUTPUT) pinMode(echo, INPUT)", "— (comment only)", "—"],
          ]}
        />
      </Section>

      <Section title="Example generated sketch">
        <CodeBlock code={`// Auto-generated from board layout

#include <Servo.h>

Servo servo1;

void setup() {
  Serial.begin(9600);
  pinMode(13, OUTPUT); // LED1
  pinMode(2, INPUT_PULLUP); // Button1
  pinMode(3, OUTPUT); // Buzzer1
  servo1.attach(9); // Servo1
  servo1.write(90); // Servo1
}

void loop() {
  digitalWrite(13, HIGH); // LED1
  analogWrite(9, 90); // Servo1
  delay(100);
}`} />
      </Section>

      <Section title="Editing the sketch">
        <p className="text-sm text-gray-300 leading-relaxed mb-2">
          Type directly in the Sketch Editor panel. There is no compile or upload — the sketch is
          stored in the project file and can be copied into the Arduino IDE for real hardware.
        </p>
        <p className="text-sm text-gray-300 leading-relaxed">
          The AI agent can write or update the sketch for you via the <code>update_sketch</code> tool.
          Ask it: <em>"Write a blink sketch for the LED on pin 13"</em> or
          <em>"Add a button on pin 2 that toggles the LED"</em>.
        </p>
      </Section>

      <Section title="Limitations">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Syntax highlighting", "Implemented — C++ monospace editor"],
            ["Auto-generation from board layout", "Implemented — boilerplate only"],
            ["Code saved to project file", "Implemented"],
            ["Compile / verify", "Not implemented — copy to Arduino IDE for that"],
            ["Runtime execution", "Not implemented — sketch is not executed in the browser"],
            ["Serial.print output", "Not implemented — Serial Monitor is a placeholder"],
            ["analogRead returning sensor values", "Not implemented — ADC not wired"],
            ["Auto-generate logic (conditions, sensors)", "Not implemented — only basic pin setup"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

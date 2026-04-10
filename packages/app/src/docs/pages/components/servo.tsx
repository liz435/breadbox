import { DocsLayout, PageTitle, Section, Table, Badge, Note, Warn, CodeBlock } from "@/docs/docs-layout"

export function ServoPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Servo Motor"
        subtitle="Positional servo with 0–180° range. Requires a PWM pin and the Servo library."
        badge={<Badge variant="implemented">Simulated</Badge>}
      />

      <Section title="Pins">
        <Table
          headers={["Pin", "Wire color", "Description"]}
          rows={[
            ["Signal", "Orange / Yellow", "PWM control signal — connect to a PWM-capable Arduino pin"],
            ["VCC", "Red", "Power — connect to 5V"],
            ["GND", "Brown / Black", "Ground — connect to GND"],
          ]}
        />
        <Warn>
          Signal must go to a PWM pin: 3, 5, 6, 9, 10, or 11. A non-PWM pin will not control the servo correctly.
        </Warn>
      </Section>

      <Section title="Properties (Inspector)">
        <Table
          headers={["Property", "Values", "Default"]}
          rows={[
            ["Signal pin", "PWM pins (3, 5, 6, 9, 10, 11)", "None"],
            ["VCC pin", "5V", "None"],
            ["GND pin", "GND", "None"],
            ["Angle", "0 – 180°", "90°"],
          ]}
        />
        <Note>
          The angle slider in the Inspector moves the servo arm visually. It does not affect simulation.
        </Note>
      </Section>

      <Section title="Simulation">
        <Table
          headers={["Feature", "Status"]}
          rows={[
            ["Servo library (attach, write, read, attached, detach)", "Implemented"],
            ["Arm rotation follows Servo.write(angle)", "Implemented — via libraryState.servos"],
            ["Electrical SPICE simulation", "Not included (visual only in netlist)"],
            ["Current draw simulation", "Not implemented"],
          ]}
        />
        <Note>
          Use <code>Servo.write(angle)</code> (not <code>analogWrite</code>) to move the arm —
          <code>analogWrite</code> on a servo pin is a no-op on the renderer side.
        </Note>
      </Section>

      <Section title="Auto-generated sketch code">
        <CodeBlock code={`#include <Servo.h>

Servo servo1;

void setup() {
  servo1.attach(9); // Servo1
  servo1.write(90); // Servo1 — center position
}

void loop() {
  analogWrite(9, 90); // Servo1
  delay(100);
}`} />
      </Section>

      <Section title="Typical sketch patterns">
        <CodeBlock code={`#include <Servo.h>
Servo myServo;

void setup() {
  myServo.attach(9);
}

void loop() {
  // Sweep 0° to 180°
  for (int angle = 0; angle <= 180; angle++) {
    myServo.write(angle);
    delay(15);
  }
  // Sweep back
  for (int angle = 180; angle >= 0; angle--) {
    myServo.write(angle);
    delay(15);
  }
}`} />
        <Note>
          Always use the <code>Servo</code> library — do not use <code>analogWrite()</code> directly.
          The Servo library generates the correct 50 Hz PWM signal.
        </Note>
      </Section>

      <Section title="Datasheet (SG90)">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Operating voltage", "4.8 – 6.0 V"],
            ["Stall current", "~200 mA"],
            ["No-load current", "~10 mA"],
            ["Rotation range", "0 – 180°"],
            ["PWM frequency", "50 Hz"],
            ["Pulse width", "1 ms (0°) to 2 ms (180°)"],
            ["Torque (4.8V)", "1.8 kg·cm"],
            ["Speed (4.8V)", "0.1 s / 60°"],
          ]}
        />
        <p className="text-sm text-gray-400 mt-2">
          The 5V Arduino pin can power small servos (SG90) directly.
          Larger servos require an external 5–6V supply — do not power them from the Arduino 5V pin.
        </p>
      </Section>
    </DocsLayout>
  )
}

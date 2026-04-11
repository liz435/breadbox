// Arduino Programming > Libraries > Servo library

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function ServoLibraryPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "servo-library",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Servo library"
        subtitle="Drive a hobby servo to a specific angle with one function call."
      />

      <Section title="What is a servo?">
        <p className="text-sm leading-relaxed">
          A hobby servo is a small geared motor with a built-in position
          controller. You feed it a pulse every 20 ms, and the width of
          the pulse (between 1 ms and 2 ms) tells the servo what angle to
          turn to. The <code>Servo</code> library hides all of that — you
          just call <code>write(angle)</code>.
        </p>
      </Section>

      <Section title="Wiring a servo">
        <p className="text-sm leading-relaxed">
          A standard hobby servo has three wires: signal (usually
          orange/yellow/white), +5 V (red), and ground (black/brown).
          The signal wire goes to any digital pin; the other two go to
          the board's 5 V and GND.
        </p>

        <Figure caption="A servo wired to pin 9, 5 V, and GND.">
          <Schematic cols={11} rows={7}>
            <Schematic.ArduinoPin at={[2, 2]} pin="D9" />
            <Schematic.Wire points={[[2, 2], [6, 2]]} />
            <Schematic.Label at={[8, 2]} text="SIG" />

            <Schematic.Vcc at={[2, 4]} label="+5V" />
            <Schematic.Wire points={[[2, 4], [6, 4]]} />
            <Schematic.Label at={[8, 4]} text="+5V" />

            <Schematic.Ground at={[2, 6]} />
            <Schematic.Wire points={[[2, 6], [6, 6]]} />
            <Schematic.Label at={[8, 6]} text="GND" />
          </Schematic>
        </Figure>

        <Warn>
          A moving servo under load can draw more current than the Uno's
          5 V regulator can supply from USB. For anything beyond a light
          test, power the servo from a separate 5 V supply and tie the
          grounds together.
        </Warn>
      </Section>

      <Section title="The core methods">
        <CodeBlock code={`#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);    // signal wire on pin 9
  myServo.write(90);    // center position
}

void loop() {
  myServo.write(0);     // all the way left
  delay(1000);
  myServo.write(180);   // all the way right
  delay(1000);
}`} />

        <ul className="mt-3 space-y-2 text-sm leading-relaxed">
          <li>
            <code className="text-gray-200">attach(pin)</code> — tell the
            library which pin the signal wire is on. Call it once in{" "}
            <code>setup()</code>.
          </li>
          <li>
            <code className="text-gray-200">write(angle)</code> — move
            the servo to a target angle between 0 and 180 degrees.
          </li>
          <li>
            <code className="text-gray-200">read()</code> — returns the
            last value written.
          </li>
          <li>
            <code className="text-gray-200">attached()</code> — true if
            attach() was called and detach() hasn't been.
          </li>
          <li>
            <code className="text-gray-200">detach()</code> — release
            the pin and stop sending pulses. Useful to stop a servo from
            twitching and save a little power.
          </li>
        </ul>

        <Note>
          On the Uno, the Servo library uses Timer 1, which is the same
          timer that drives PWM on pins 9 and 10. Attaching any servo
          disables <code>analogWrite()</code> on those two pins.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/pwm",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

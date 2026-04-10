// Arduino Uno Reference > Communication > Serial (USB)

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function SerialPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "serial",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Serial (USB)"
        subtitle="A text channel between your sketch and your computer."
      />

      <Section title="What it is">
        <p className="text-sm leading-relaxed">
          The Uno's USB port does two jobs. It powers the board, and it
          carries a serial connection between the ATmega328P and your
          computer. Any text your sketch prints with{" "}
          <code className="text-gray-200">Serial.print()</code> shows up
          in a console on your computer, and anything you type back gets
          delivered to the sketch. This is the main way you debug and
          interact with a running Arduino.
        </p>
      </Section>

      <Section title="The Serial Monitor">
        <p className="text-sm leading-relaxed">
          The Arduino IDE (and Dreamer) ships with a{" "}
          <strong className="text-gray-200">Serial Monitor</strong> — a
          little window that opens a serial connection to the board and
          prints everything it receives. When you click "Open Serial
          Monitor," the sketch typically resets so any <code>setup()</code>{" "}
          prints show up from the start.
        </p>
      </Section>

      <Section title="Baud rate">
        <p className="text-sm leading-relaxed">
          "Baud" is the speed of the serial link in bits per second. Both
          sides must agree. In your sketch you pick a baud rate with{" "}
          <code className="text-gray-200">Serial.begin(9600)</code>; in
          the Serial Monitor, pick the same number from the dropdown.
          Common values:
        </p>

        <Table
          headers={["Baud", "Use case"]}
          rows={[
            ["9600", "The default. Safe, slow, fine for printing."],
            ["19200", "Slightly faster, still universal."],
            ["57600", "A good middle ground."],
            ["115200", "Fast. Use when printing a lot or logging sensor data."],
          ]}
        />

        <Warn>
          If the Serial Monitor shows garbage characters (ÂÃ… etc),
          you've almost certainly picked the wrong baud rate. Match
          whatever number is in your <code>Serial.begin()</code> call.
        </Warn>
      </Section>

      <Section title="Pins 0 and 1 are special">
        <p className="text-sm leading-relaxed">
          Behind the scenes, the serial link runs over digital pins{" "}
          <code>D0</code> (RX — receive) and <code>D1</code> (TX — transmit).
          These are the same pins the USB-to-serial chip on the board is
          wired to. That means:
        </p>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed list-disc pl-5">
          <li>Don't wire components to D0/D1 if you also want to use Serial.</li>
          <li>The onboard RX/TX LEDs flash whenever data moves across the USB link — useful as a sanity light.</li>
          <li>Uploading a sketch uses these same pins, which is why the board resets each time.</li>
        </ul>
      </Section>

      <Section title="Quick example">
        <CodeBlock code={`void setup() {
  Serial.begin(9600);
  Serial.println("Sketch started");
}

void loop() {
  Serial.print("Uptime: ");
  Serial.print(millis() / 1000);
  Serial.println(" seconds");
  delay(1000);
}`} />

        <Note>
          Always call <code>Serial.begin()</code> in <code>setup()</code>{" "}
          once before using any other Serial function. Calling
          <code>Serial.print()</code> without it does nothing.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/serial-api",
          "board/digital-pins",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// Arduino Uno Reference > The board > The onboard LED on pin 13

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function OnboardLedPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "onboard-led",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="The onboard LED on pin 13"
        subtitle="Why every Arduino has a built-in 'is my sketch running?' light."
      />

      <Section title="What it is">
        <p className="text-sm leading-relaxed">
          Look at the middle of the board and you'll see a small
          surface-mount LED labeled <code>L</code> (occasionally{" "}
          <code>L13</code>). It's wired directly to digital{" "}
          <Term k="pin-mode">pin 13</Term> through a current-limiting
          resistor that's already on the PCB. Whenever your sketch
          sets pin 13 HIGH, the onboard LED lights up — even if you
          haven't wired anything to the header pin.
        </p>

        <Figure caption="The onboard LED, schematically. The resistor and LED are already on the board.">
          <Schematic cols={10} rows={5}>
            <Schematic.ArduinoPin at={[2, 2]} pin="D13" />
            <Schematic.Wire points={[[2, 2], [3, 2]]} />
            <Schematic.Resistor from={[3, 2]} to={[6, 2]} label="1 kΩ" />
            <Schematic.Led from={[6, 2]} to={[8, 2]} label="L" />
            <Schematic.Wire points={[[8, 2], [8, 4]]} />
            <Schematic.Ground at={[8, 4]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="Why it exists">
        <p className="text-sm leading-relaxed">
          Two reasons, one practical and one historical.
        </p>
        <p className="text-sm leading-relaxed">
          <strong className="text-gray-200">Practical:</strong> when
          you're bringing up a new board or debugging a flaky cable,
          you need the simplest possible "the CPU is alive and my
          sketch is running" signal. The onboard LED gives you that
          with <em className="text-gray-200">zero wiring</em>. Upload
          a blink sketch, see the light pulse, and you know your USB
          driver, your toolchain, and your ATmega are all healthy.
        </p>
        <p className="text-sm leading-relaxed">
          <strong className="text-gray-200">Historical:</strong>{" "}
          "Blink" is the traditional first Arduino program — and has
          been since the original 2005 boards. Every Arduino from the
          NG through the Uno through modern variants keeps the pin 13
          LED for backwards compatibility with decades of "blink an
          LED to test your setup" tutorials.
        </p>
      </Section>

      <Section title="Using it from a sketch">
        <p className="text-sm leading-relaxed">
          You drive the onboard LED exactly the same way you'd drive
          any external LED on pin 13:
        </p>

        <CodeBlock
          code={`void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}`}
        />

        <p className="text-sm leading-relaxed">
          <code>LED_BUILTIN</code> is a macro defined in the Arduino
          core that resolves to the pin number of the onboard LED.
          On the Uno it's 13, but using <code>LED_BUILTIN</code>{" "}
          instead of a bare <code>13</code> means your sketch will
          still work on boards where the onboard LED is wired to a
          different pin (some Nano variants, the MKR series, etc.).
        </p>

        <Note>
          The Dreamer simulator recognizes both{" "}
          <code>LED_BUILTIN</code> and the literal <code>13</code>.
          The existing{" "}
          <a href="/learn/blink-led" className="text-emerald-400 hover:underline">
            blink lesson
          </a>{" "}
          uses <code>13</code> directly for clarity.
        </Note>
      </Section>

      <Section title="Gotchas">
        <ul className="space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">Pin 13 is shared.</strong>{" "}
            The onboard LED and the header pin are the{" "}
            <em className="text-gray-200">same pin</em>. If you wire a
            second LED to the header, both LEDs will light in lock-
            step. If you wire a sensor to the header, the onboard LED
            will flicker as the sensor changes state, which can be
            surprising if you didn't expect it.
          </li>
          <li>
            <strong className="text-gray-200">Don't use pin 13 as an input.</strong>{" "}
            The onboard LED+resistor weakly pull the pin toward
            ground, which skews readings from switches and sensors. If
            you need another digital input, pick any other pin.
          </li>
          <li>
            <strong className="text-gray-200">Pin 13 is also SCK.</strong>{" "}
            The Uno's hardware SPI routes the clock signal to pin 13.
            If you're using SPI (microSD card readers, OLED displays
            with SPI interface, etc.) the onboard LED will flicker
            every time data is transferred — that's the clock pulse.
            Again, surprising but harmless.
          </li>
        </ul>
      </Section>

      <SeeAlso
        refs={[
          "board/anatomy",
          "board/digital-pins",
          "programming/digital-io",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

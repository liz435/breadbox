// Arduino Uno Reference > Pins & I/O > Digital pins D0–D13

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function DigitalPinsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "digital-pins",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Digital pins D0–D13"
        subtitle="Fourteen pins along the top edge of the board. Six of them can pretend to be analog."
      />

      <Section title="What they are">
        <p className="text-sm leading-relaxed">
          The top edge of the Uno has a single long header with 14
          digital pins, labeled <code>D0</code> through <code>D13</code>.
          Each one is a <strong className="text-gray-200">bidirectional
          digital I/O line</strong>: the sketch can either drive it HIGH
          (5 V) or LOW (0 V) as an output, or read its current state as
          an input.
        </p>
        <p className="text-sm leading-relaxed">
          "Digital" here means the pin only has two values. There are
          no "partial" or "in between" values on a digital pin — it's
          either at 5 V or 0 V, and that's how your sketch sees it when
          it calls <Term k="digital-read">digitalRead()</Term>.
        </p>

        <Figure caption="A digital output pin driving an LED through a current-limiting resistor to ground.">
          <Schematic cols={10} rows={5}>
            <Schematic.ArduinoPin at={[2, 2]} pin="D13" />
            <Schematic.Wire points={[[2, 2], [3, 2]]} />
            <Schematic.Resistor from={[3, 2]} to={[6, 2]} label="220Ω" />
            <Schematic.Led from={[6, 2]} to={[8, 2]} />
            <Schematic.Wire points={[[8, 2], [8, 4]]} />
            <Schematic.Ground at={[8, 4]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="Not all pins are equal">
        <p className="text-sm leading-relaxed">
          Under the hood, the ATmega328P gives several digital pins
          double duty. You can still use them as plain digital I/O if
          you want, but they're also the access points for features
          that live deeper in the chip.
        </p>

        <Table
          headers={["Pin", "Also does…", "Why you care"]}
          rows={[
            [
              "D0 / D1",
              "Hardware serial (RX / TX)",
              "These carry the USB serial data. Wiring anything else to them interferes with uploading sketches — avoid unless you're building a custom serial device.",
            ],
            [
              "D2 / D3",
              "External interrupts (INT0 / INT1)",
              "The only pins that can trigger a hardware interrupt on a level change. Use them for rotary encoders, fast button detection, etc.",
            ],
            [
              "D3, D5, D6, D9, D10, D11",
              "PWM output",
              "Marked ~ on the board. Can approximate analog voltages with analogWrite(). Required for LED fading, servos, motor speed.",
            ],
            [
              "D10, D11, D12, D13",
              "Hardware SPI (SS / MOSI / MISO / SCK)",
              "The bus used by OLED displays, SD card modules, and anything that says 'SPI' on the datasheet.",
            ],
            [
              "D13",
              "Onboard LED",
              "There's a surface-mount LED wired to pin 13 with its own resistor. Great for a 'the sketch is running' sanity light.",
            ],
          ]}
        />

        <Note>
          The full pin table lives in the{" "}
          <a
            href="/documentation/arduino-uno"
            className="text-blue-400 hover:underline"
          >
            Arduino Uno docs page
          </a>
          . This page covers the concept; that one covers every pin
          one by one.
        </Note>
      </Section>

      <Section title="Input vs output modes">
        <p className="text-sm leading-relaxed">
          Before you use a digital pin, you have to tell the chip
          which direction it's going. That's what{" "}
          <Term k="pin-mode">pinMode()</Term> does. There are three
          options:
        </p>

        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">OUTPUT</strong> — the
            sketch drives the pin. <Term k="digital-write">digitalWrite()</Term>
            {" "}switches it between 0 V and 5 V. Use this for LEDs,
            relays, buzzers, servo control lines.
          </li>
          <li>
            <strong className="text-gray-200">INPUT</strong> — the
            sketch reads the pin. The pin is high-impedance (it doesn't
            source or sink significant current) and floats to whatever
            voltage the attached circuit drives it to. Use this when
            the circuit already has a pull-up or pull-down resistor.
          </li>
          <li>
            <strong className="text-gray-200">INPUT_PULLUP</strong> —
            like INPUT, but the chip enables its internal ~20 kΩ{" "}
            <Term k="pull-up">pull-up resistor</Term> so the pin reads
            HIGH by default. The canonical button wiring: switch goes
            between the pin and GND, and pressing the button pulls the
            pin LOW.
          </li>
        </ul>

        <Warn>
          A single digital pin can source or sink about 20 mA safely
          (40 mA absolute maximum). That's enough for one LED through
          a current-limiting resistor, but not enough for a motor, a
          high-current buzzer, or a relay coil. For anything heavier,
          use a transistor driven by the pin.
        </Warn>
      </Section>

      <Section title="Reading the board silkscreen">
        <p className="text-sm leading-relaxed">
          On a real Arduino Uno, the digital header is at the top of
          the board and is labeled{" "}
          <code className="text-gray-200">DIGITAL (PWM ~)</code>. Each
          pin's label is printed on the silkscreen:
        </p>

        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
          <li>Pins with a <code>~</code> prefix (e.g. <code>~9</code>) support PWM.</li>
          <li>Pins <code>0</code> and <code>1</code> are additionally labeled <code>RX</code> and <code>TX</code>.</li>
          <li>Pin <code>13</code> is labeled <code>13</code> with an <code>L</code> next to it — that's the onboard LED indicator.</li>
        </ul>

        <p className="text-sm leading-relaxed mt-3">
          There are also two extra pins on the digital header that
          aren't in the D0–D13 range:{" "}
          <code className="text-gray-200">GND</code> (another ground,
          convenient for breadboard layouts) and{" "}
          <code className="text-gray-200">AREF</code> (analog voltage
          reference, rarely used — ignore unless you're tuning the
          ADC).
        </p>
      </Section>

      <SeeAlso
        refs={[
          "board/analog-pins",
          "board/pwm",
          "board/interrupts",
          "board/onboard-led",
          "programming/digital-io",
          "electronics/pull-ups",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

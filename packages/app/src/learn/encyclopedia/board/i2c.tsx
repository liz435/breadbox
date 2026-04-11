// Arduino Uno Reference > Communication > I2C on the Uno

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function BoardI2cPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "i2c",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="I2C on the Uno"
        subtitle="Two wires on A4 and A5 let you share a bus with many peripherals at once."
      />

      <Section title="The two pins">
        <p className="text-sm leading-relaxed">
          The Uno's <Term k="i2c" /> bus lives on two of the analog
          pins: A4 carries SDA (the data line), A5 carries SCL (the
          clock line). Both pins are doubled onto the 4-pin header
          above the AREF pin on newer Unos, so a shield can grab them
          without touching A4/A5 directly.
        </p>

        <Table
          headers={["Pin", "I2C role"]}
          rows={[
            ["A4", "SDA — bidirectional data"],
            ["A5", "SCL — clock from master"],
          ]}
        />

        <Figure caption="The I2C bus — SDA and SCL pulled HIGH through resistors to 5 V, then tapped by every slave that shares the bus.">
          <Schematic cols={14} rows={8}>
            {/* Vcc rail across the top with pull-ups */}
            <Schematic.Vcc at={[6, 0]} label="+5V" />
            <Schematic.Vcc at={[8, 0]} label="+5V" />
            <Schematic.Resistor from={[6, 0]} to={[6, 2]} label="4.7kΩ" />
            <Schematic.Resistor from={[8, 0]} to={[8, 2]} label="4.7kΩ" />

            {/* Master pins on the left */}
            <Schematic.ArduinoPin at={[2, 2]} pin="A4" />
            <Schematic.ArduinoPin at={[2, 4]} pin="A5" />

            {/* SDA bus line (row 2) */}
            <Schematic.Wire points={[[2, 2], [13, 2]]} />
            {/* SCL bus line (row 4) */}
            <Schematic.Wire points={[[2, 4], [13, 4]]} />

            {/* Junctions where pull-ups meet bus */}
            <Schematic.Junction at={[6, 2]} />
            <Schematic.Junction at={[8, 2]} />

            {/* Bus labels */}
            <Schematic.Label at={[13, 2]} text="SDA" anchor="start" dy={-4} />
            <Schematic.Label at={[13, 4]} text="SCL" anchor="start" dy={-4} />

            {/* Slave 1: OLED — two vertical taps at cols 4,4 and 4,4 */}
            <Schematic.Junction at={[4, 2]} />
            <Schematic.Junction at={[4, 4]} />
            <Schematic.Wire points={[[4, 2], [4, 6]]} />
            <Schematic.Wire points={[[4, 4], [4, 6]]} />
            <Schematic.Label at={[4, 7]} text="OLED" />

            {/* Slave 2: RTC */}
            <Schematic.Junction at={[7, 2]} />
            <Schematic.Junction at={[7, 4]} />
            <Schematic.Wire points={[[7, 2], [7, 6]]} />
            <Schematic.Wire points={[[7, 4], [7, 6]]} />
            <Schematic.Label at={[7, 7]} text="RTC" />

            {/* Slave 3: Sensor */}
            <Schematic.Junction at={[11, 2]} />
            <Schematic.Junction at={[11, 4]} />
            <Schematic.Wire points={[[11, 2], [11, 6]]} />
            <Schematic.Wire points={[[11, 4], [11, 6]]} />
            <Schematic.Label at={[11, 7]} text="Sensor" />
          </Schematic>
        </Figure>
      </Section>

      <Section title="One bus, many devices">
        <p className="text-sm leading-relaxed">
          Every I2C peripheral sits on the same two wires. Each one
          has a 7-bit address burned into it at the factory (some can
          be changed by soldering jumpers), so the master picks which
          chip it wants to talk to by sending that address before the
          data. You can have a temperature sensor, an OLED, and a
          real-time clock all sharing SDA/SCL, as long as their
          addresses differ.
        </p>
      </Section>

      <Section title="Pull-ups are not optional">
        <p className="text-sm leading-relaxed">
          I2C lines are open-drain: devices only pull them LOW, and
          the bus floats HIGH through external <Term k="pull-up" />{" "}
          resistors (typically 4.7 kΩ to 10 kΩ, one per line). Most
          breakout boards include the pull-ups on board. If your bus
          has no pull-ups anywhere, nothing will work — the lines
          stay at an undefined voltage and every transaction fails.
        </p>

        <Note>
          Dreamer doesn't model I2C at the bit level. The SSD1306 and
          RTC peripherals it supports talk through a higher-level
          stub. If you're wiring a real Uno, follow this page.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/i2c-concepts",
          "electronics/pull-ups",
          "board/spi",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// Electronics Fundamentals > Signals > I2C concepts

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function I2cConceptsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "i2c-concepts",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="I2C concepts"
        subtitle="A two-wire bus shared by up to 127 peripherals, each picked out by a 7-bit address."
      />

      <Section title="Two wires, one master">
        <p className="text-sm leading-relaxed">
          <Term k="i2c" /> (pronounced "eye-squared-see") carries
          data on two shared lines: SDA (serial data) and SCL
          (serial clock). One device on the bus is the master —
          on an Arduino project that's almost always the Arduino
          itself — and every other device is a peripheral. The
          master drives the clock, decides who gets to speak,
          and initiates every transaction.
        </p>

        <p className="text-sm leading-relaxed">
          Data goes in both directions on SDA, but only one
          party at a time. That's enough to read a sensor, set a
          register on a display driver, or stream bytes to an
          RTC, all over the same pair of wires.
        </p>
      </Section>

      <Section title="Addresses">
        <p className="text-sm leading-relaxed">
          Every peripheral has a 7-bit address hard-wired at the
          factory, though many parts let you flip one or two
          bits with solder jumpers so you can put more than one
          of the same chip on one bus. The master starts a
          transaction by sending the address; the matching
          peripheral acknowledges, and the rest of the bytes
          belong to it. Any other peripheral that heard a
          different address ignores the exchange.
        </p>
      </Section>

      <Section title="Open-drain and pull-ups">
        <p className="text-sm leading-relaxed">
          Both SDA and SCL are open-drain. A device can pull the
          line LOW, but nothing on the bus ever drives it HIGH —
          the lines float up through external{" "}
          <Term k="pull-up" /> resistors, typically 4.7 kΩ to
          10 kΩ. This is what lets multiple devices share one
          line without fighting: the worst that can happen when
          two talk at once is the line gets pulled LOW, which
          the master can detect. If your bus has no pull-ups at
          all, it simply does not work. Most breakout boards
          include them.
        </p>

        <Note>
          The bus was invented for slow on-board communication
          (standard mode is 100 kbit/s) and lives happily up to
          400 kbit/s in "fast mode". It is not the right choice
          when you need megabits — reach for SPI instead.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/i2c",
          "electronics/pull-ups",
          "electronics/spi-concepts",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

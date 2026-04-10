// Electronics Fundamentals > Signals > SPI concepts

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function SpiConceptsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "spi-concepts",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="SPI concepts"
        subtitle="Four wires, full-duplex, and much faster than I2C — one peripheral active at a time."
      />

      <Section title="The four wires">
        <p className="text-sm leading-relaxed">
          <Term k="spi" /> runs on four lines: SCK (clock, from
          master), MOSI (master-out-slave-in), MISO
          (master-in-slave-out), and SS (slave-select, active
          LOW, one per peripheral). The master drives the clock
          and the SS line for whichever peripheral it wants to
          talk to; on every clock edge, a bit goes out on MOSI
          and a bit comes back on MISO simultaneously. That's
          what "full-duplex" means — bytes flow in both
          directions on the same clock.
        </p>

        <Table
          headers={["Line", "Direction", "Role"]}
          rows={[
            ["SCK", "Master → peripheral", "Clock"],
            ["MOSI", "Master → peripheral", "Master out, slave in"],
            ["MISO", "Peripheral → master", "Master in, slave out"],
            ["SS", "Master → peripheral", "Slave select, active LOW"],
          ]}
        />
      </Section>

      <Section title="One peripheral at a time">
        <p className="text-sm leading-relaxed">
          To put two peripherals on the same bus, you share
          SCK, MOSI, and MISO across both and give each its own
          SS line on a separate digital pin. The master pulls
          the chosen SS LOW, clocks the bytes for that
          peripheral, then releases SS back HIGH before
          selecting the next one. Because there are no
          addresses, SPI peripherals can be simpler and faster
          than I2C ones — the chip only listens when its SS is
          asserted.
        </p>
      </Section>

      <Section title="Faster than I2C">
        <p className="text-sm leading-relaxed">
          SPI has no open-drain requirement, no pull-ups, no
          addressing overhead, and the lines are actively driven
          both HIGH and LOW. That lets it run much faster — the
          Uno's hardware SPI hits 8 MHz comfortably, compared
          with 100–400 kHz for I2C. The price is more wires and
          the need for a dedicated pin per peripheral.
        </p>

        <Note>
          SPI comes in a few "modes" that differ in which clock
          edge samples data and what the clock idles at. You
          rarely need to worry about this — use the mode the
          peripheral's datasheet specifies, which is usually
          mode 0.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/spi",
          "electronics/i2c-concepts",
          "programming/shift-out-in",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

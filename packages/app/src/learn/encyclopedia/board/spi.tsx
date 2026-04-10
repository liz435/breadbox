// Arduino Uno Reference > Communication > SPI on the Uno

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

export function BoardSpiPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "spi",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="SPI on the Uno"
        subtitle="Four digital pins carry a faster, full-duplex bus for a single peripheral at a time."
      />

      <Section title="The four pins">
        <p className="text-sm leading-relaxed">
          The Uno's hardware <Term k="spi" /> is wired to digital pins
          10 through 13. The master (the Uno) drives the clock, picks
          which peripheral is active with an SS (slave-select) line,
          and exchanges data with that peripheral one bit per clock.
        </p>

        <Table
          headers={["Pin", "SPI role"]}
          rows={[
            ["D10", "SS — slave select (active LOW)"],
            ["D11", "MOSI — master out, slave in"],
            ["D12", "MISO — master in, slave out"],
            ["D13", "SCK — serial clock"],
          ]}
        />
      </Section>

      <Section title="The ICSP header">
        <p className="text-sm leading-relaxed">
          The 2×3 header next to the ATmega328P labelled ICSP is the
          second copy of the SPI bus. MOSI, MISO, and SCK all appear
          on that header as well, which is how shields that need SPI
          can reach it on boards where D11–D13 get reassigned (the
          Mega, for example). For a plain Uno, the ICSP pins and
          D11/D12/D13 are the same electrical wires.
        </p>
      </Section>

      <Section title="One peripheral at a time">
        <p className="text-sm leading-relaxed">
          SPI is point-to-point in practice: one master, one active
          peripheral at a time. To talk to several peripherals, give
          each one its own SS line on a different digital pin. Pull
          the chosen one LOW, clock the bytes, then release it HIGH
          before talking to the next. D10 is only the{" "}
          <em className="text-gray-200">default</em> SS — any spare
          digital pin works.
        </p>

        <Note>
          If you set D10 to INPUT while using SPI, the hardware can
          silently drop out of master mode. Keep it as OUTPUT even if
          you're using a different pin for slave-select.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/spi-concepts",
          "board/i2c",
          "board/digital-pins",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

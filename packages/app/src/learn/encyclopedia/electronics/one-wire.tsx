// Electronics Fundamentals > Signals > 1-Wire

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function OneWirePage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "one-wire",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="1-Wire"
        subtitle="A single data line does double duty — it both powers the peripheral and carries bidirectional data."
      />

      <Section title="One line for everything">
        <p className="text-sm leading-relaxed">
          1-Wire and its relatives are the minimalist end of the
          bus spectrum. A sensor gets two connections to the
          Arduino: ground and a single data pin. That data pin
          carries every transaction in both directions, and in
          "parasitic power" mode it also trickle-charges a tiny
          capacitor inside the sensor so the sensor doesn't
          need a dedicated VCC wire at all. You still want a
          4.7 kΩ pull-up on the data line so it floats HIGH when
          nobody is talking.
        </p>
      </Section>

      <Section title="Where you'll meet it">
        <p className="text-sm leading-relaxed">
          The canonical 1-Wire part is the Dallas DS18B20
          digital temperature sensor. You can string several of
          them on one wire, each identified by a unique 64-bit
          ROM code burned in at the factory, and ask each one
          in turn for a temperature reading. DHT11 and DHT22
          humidity sensors are close cousins — they use a
          single data line with a custom protocol rather than
          strict 1-Wire, but the wiring looks the same and the
          software libraries treat them similarly.
        </p>
      </Section>

      <Section title="What the line looks like">
        <p className="text-sm leading-relaxed">
          Timing is tight. A master pulls the line LOW for a
          precise number of microseconds to signal "send me a
          0" or "send me a 1", then releases it and samples
          what the sensor does. This is why libraries like
          OneWire and DHT do the bit-banging for you — getting
          the timing wrong by a few microseconds causes the
          transaction to fail silently and the sensor to return
          garbage.
        </p>

        <Note>
          The 4.7 kΩ pull-up between the data line and VCC is
          not optional. Dreamer hides this when it models a
          DHT sensor, but on real hardware the circuit simply
          does not work without it.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/dht-library",
          "electronics/pull-ups",
          "electronics/i2c-concepts",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

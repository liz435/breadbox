import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function DhtSensorLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Temp and Humidity (DHT11)"
        subtitle="Read temperature and humidity from a DHT11 over a single-wire protocol."
      
        badge={<DifficultyBadge difficulty="advanced" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A DHT11 sensor wired to pin <code className="text-gray-200">D2</code>. The
          sketch uses the <code className="text-gray-200">DHT</code> library to read
          temperature in Celsius and relative humidity, then prints both to Serial once
          per loop.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="16-dht-sensor" panels={["code", "serial"]} height={520} />
        <Note>
          Press <strong>Play</strong>. Temperature and humidity values appear in the
          Serial panel. The sensor slider in the simulator lets you change the simulated
          reading.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          The DHT11 uses a proprietary single-wire protocol — not I2C or SPI. The
          master (Arduino) pulls the data line LOW for at least 18 ms to wake the
          sensor, then releases it. The sensor responds with a start signal and then
          sends 40 bits: 16 bits of humidity data, 16 bits of temperature data, and an
          8-bit checksum. The <code className="text-gray-200">DHT</code> library handles
          all of that timing on your behalf.
        </p>
        <p className="text-sm leading-relaxed">
          <code className="text-gray-200">dht.readTemperature()</code> and{" "}
          <code className="text-gray-200">dht.readHumidity()</code> return{" "}
          <Term k="floating-point">float</Term> values, or{" "}
          <code className="text-gray-200">NaN</code> if the read fails (checksum error or
          no response). A real sketch should check for <code className="text-gray-200">isnan()</code>{" "}
          before printing.
        </p>
      </Section>

      <Section title="Why a library for this sensor?">
        <p className="text-sm leading-relaxed">
          The DHT protocol's bit timing is in the range of 26–80 {"\u03bc"}s — too precise to
          bit-bang reliably without disabling interrupts. The library uses
          direct pin toggling and tight timing loops, which is impractical to write
          correctly by hand. Whenever a protocol has microsecond-level timing requirements
          and published spec documents, a well-tested library is the right tool.
        </p>
      </Section>

      <LessonFooter currentSlug="dht-sensor" />
    </LearnLayout>
  )
}

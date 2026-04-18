import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function TemperatureSensorLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Read Temperature (TMP36)"
        subtitle="Convert an analog voltage into degrees Celsius with a TMP36 sensor."
      
        badge={<DifficultyBadge difficulty="intermediate" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A TMP36 analog temperature sensor wired to pin{" "}
          <code className="text-gray-200">A0</code>. The sketch converts the raw{" "}
          <Term k="adc">ADC</Term> reading to a voltage, then to degrees Celsius, and
          prints the result to Serial once per second.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="11-temperature-sensor" panels={["code", "serial"]} height={520} />
        <Note>
          Press <strong>Play</strong>. Temperature readings appear in the Serial panel.
          Use the sensor's slider in the simulator to simulate warmer or cooler
          conditions.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          The TMP36 outputs a linear voltage proportional to temperature: 0.5 V at 0{"\u00b0"}C,
          rising 10 mV per degree. The sketch reads the raw value with{" "}
          <Term k="analog-read">
            <code className="text-gray-200">analogRead(A0)</code>
          </Term>{" "}
          (0–1023), converts it to volts with{" "}
          <code className="text-gray-200">reading * (5.0 / 1024.0)</code>, then subtracts
          the 0.5 V offset and multiplies by 100 to get Celsius:
        </p>
        <p className="text-sm leading-relaxed font-mono text-gray-200">
          tempC = (voltage - 0.5) * 100.0
        </p>
      </Section>

      <Section title="Why floating-point arithmetic?">
        <p className="text-sm leading-relaxed">
          The raw ADC value is an integer, but the conversion involves division and
          fractional constants. Using integer math would round away the decimal precision
          needed for meaningful temperature readings.{" "}
          <Term k="floating-point">Float</Term> on the Uno is 32-bit IEEE 754 — accurate
          to about 6 significant digits, more than enough for a temperature sensor whose
          typical accuracy is ±2{"\u00b0"}C.
        </p>
      </Section>

      <LessonFooter currentSlug="temperature-sensor" />
    </LearnLayout>
  )
}

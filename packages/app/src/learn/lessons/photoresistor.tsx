import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function PhotoresistorLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Read a Light Sensor"
        subtitle="Print ambient light readings to Serial using a photoresistor."
      
        badge={<DifficultyBadge difficulty="intermediate" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A photoresistor (LDR) paired with a fixed <Term k="resistor" /> in a{" "}
          <Term k="voltage-divider" /> configuration, connected to analog pin{" "}
          <code className="text-foreground">A0</code>. The sketch reads the light level
          every 500 ms and prints the raw <Term k="adc">ADC</Term> value to{" "}
          <code className="text-foreground">Serial</code>.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="08-photoresistor" panels={["code", "serial"]} height={520} />
        <Note>
          Press <strong>Play</strong> and watch numbers stream into the Serial panel. The
          photoresistor in the simulator has a slider — drag it to simulate bright or dim
          light and see the values change.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          A photoresistor's resistance drops as light intensity increases. Paired with a
          fixed resistor to ground, it forms a <Term k="voltage-divider" />: in bright
          light the photoresistor's resistance is low, so most of the 5 V appears at A0
          (high reading). In dim light the resistance is high, pulling A0 closer to GND
          (low reading).{" "}
          <Term k="analog-read">
            <code className="text-foreground">analogRead(A0)</code>
          </Term>{" "}
          converts that 0–5 V range to 0–1023.
        </p>
        <p className="text-sm leading-relaxed">
          The <code className="text-foreground">Serial.print()</code> calls in{" "}
          <code className="text-foreground">loop()</code> send the value over USB so you
          can monitor it in real time. The baud rate set in{" "}
          <code className="text-foreground">Serial.begin(9600)</code> must match the Serial
          monitor's speed.
        </p>
      </Section>

      <Section title="Why a voltage divider for a sensor?">
        <p className="text-sm leading-relaxed">
          The Arduino can only read voltage, not resistance. The fixed resistor converts
          the photoresistor's changing resistance into a changing voltage the ADC can
          measure. Choosing a fixed resistor close to the photoresistor's mid-range
          resistance gives the most usable swing across the ADC's 0–5 V input range.
        </p>
      </Section>

      <LessonFooter currentSlug="photoresistor" />
    </LearnLayout>
  )
}

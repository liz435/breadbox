import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function CapacitorLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Capacitor Charge and Discharge"
        subtitle="Watch an LED fade naturally as a capacitor drains."
      
        badge={<DifficultyBadge difficulty="beginner" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A circuit where pin 7 charges a <Term k="capacitor" /> through a 1 k{"\u03a9"}{" "}
          <Term k="resistor" />. The LED sits in parallel with the capacitor, glowing brightly
          when the cap is full and fading slowly as it discharges — no{" "}
          <code className="text-foreground">analogWrite()</code> required.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="07-capacitor" panels={["code", "serial"]} height={520} />
        <Note>
          Press <strong>Play</strong>. The LED brightens as the capacitor charges and then
          fades gradually after the pin goes LOW. The Serial panel shows the charge/discharge
          messages the sketch prints.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          In <code className="text-foreground">setup()</code>, pin 7 is declared an output.
          The <code className="text-foreground">loop()</code> writes HIGH, waits for the
          capacitor to charge fully, then writes LOW and waits for it to discharge. While
          charging, the voltage across the cap (and LED) rises toward 5 V. After the pin
          drops to LOW, the cap releases its stored charge back through the LED, which
          dims gradually as the voltage falls — a characteristic RC decay curve.
        </p>
      </Section>

      <Section title="Why does the LED fade smoothly?">
        <p className="text-sm leading-relaxed">
          A <Term k="capacitor" /> stores charge proportional to voltage (Q = C × V) and
          releases it exponentially over time. The time constant{" "}
          <span className="font-mono text-foreground">{"\u03c4"} = R × C</span> tells you
          how quickly that happens — after one time constant the voltage has dropped to about
          37% of its starting value. The gentle fade you see is this RC discharge playing
          out in real time, not software dimming.
        </p>
      </Section>

      <LessonFooter currentSlug="capacitor" />
    </LearnLayout>
  )
}

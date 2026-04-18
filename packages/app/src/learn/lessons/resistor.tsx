import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function ResistorLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Current Limiting with a Resistor"
        subtitle="See why every LED needs a series resistor to stay safe."
      
        badge={<DifficultyBadge difficulty="beginner" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A blinking <Term k="led" /> on pin{" "}
          <code className="text-gray-200">D13</code> with a 330{"\u03a9"}{" "}
          <Term k="resistor">current-limiting resistor</Term> in series. This is the
          same circuit as Lesson 1, but the lesson focuses on the resistor's role rather
          than the sketch.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="06-resistor" panels={["code"]} height={440} />
        <Note>
          The circuit and sketch are intentionally identical to Blink an LED. Focus on the
          resistor between pin 13 and the LED anode.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          When pin 13 goes HIGH it supplies 5 V. The LED's{" "}
          <Term k="forward-voltage">forward voltage</Term> drops about 2 V across the LED
          itself, leaving 3 V across the resistor. By{" "}
          <Term k="ohms-law">Ohm's law</Term> (I = V / R), a 330{"\u03a9"} resistor passes
          3 V / 330 {"\u03a9"} ≈ 9 mA — well within the LED's safe operating range and
          below the Arduino pin's 40 mA absolute maximum.
        </p>
      </Section>

      <Section title="Choosing the right resistor value">
        <p className="text-sm leading-relaxed">
          A typical LED is brightest and safe between 10 and 20 mA. To target 15 mA with
          a red LED (Vf ≈ 2 V) on a 5 V supply:
        </p>
        <p className="text-sm leading-relaxed font-mono text-gray-200">
          R = (5 V - 2 V) / 0.015 A = 200{"\u03a9"}
        </p>
        <p className="text-sm leading-relaxed">
          Round up to the nearest standard value (220{"\u03a9"} or 330{"\u03a9"}) and the LED
          runs slightly dimmer but safely. Going lower risks burning out the LED or
          overloading the pin; going much higher just dims the LED without harm.
        </p>
      </Section>

      <LessonFooter currentSlug="resistor" />
    </LearnLayout>
  )
}

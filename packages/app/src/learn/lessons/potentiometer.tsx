import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function PotentiometerLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Control Brightness with a Pot"
        subtitle="Read an analog voltage and map it to LED brightness."
      
        badge={<DifficultyBadge difficulty="beginner" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A <Term k="potentiometer" /> wired as a <Term k="voltage-divider" /> to analog
          pin <code className="text-foreground">A0</code>, with an{" "}
          <Term k="led" /> on pin{" "}
          <code className="text-foreground">D9</code>. Turning the pot knob changes the
          LED brightness in real time.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="05-potentiometer" panels={["code"]} height={460} />
        <Note>
          Press <strong>Play</strong>, then drag the pot slider inside the embed to
          change the LED brightness.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          The potentiometer's three pins are: left terminal to 5 V, right terminal to GND,
          and the wiper (center) to A0. As you turn the knob, the wiper slides between
          the two rails, producing a voltage anywhere from 0 V to 5 V. The Arduino's{" "}
          <Term k="adc">10-bit ADC</Term> converts that voltage to an integer from 0
          to 1023 via{" "}
          <Term k="analog-read">
            <code className="text-foreground">analogRead(A0)</code>
          </Term>
          .
        </p>
        <p className="text-sm leading-relaxed">
          <code className="text-foreground">map(val, 0, 1023, 0, 255)</code> rescales that
          range to 0–255, which is exactly what{" "}
          <Term k="analog-write">
            <code className="text-foreground">analogWrite()</code>
          </Term>{" "}
          expects for its <Term k="duty-cycle">duty cycle</Term>. Full pot = full
          brightness; zero pot = LED off.
        </p>
      </Section>

      <Section title="Why map() instead of dividing?">
        <p className="text-sm leading-relaxed">
          Dividing by 4 (1023 / 4 ≈ 255) works but truncates. The built-in{" "}
          <code className="text-foreground">map()</code> function applies a proper linear
          interpolation between any two ranges, so swapping sensor or output ranges later
          is a one-line change instead of recalculating constants.
        </p>
      </Section>

      <LessonFooter currentSlug="potentiometer" />
    </LearnLayout>
  )
}

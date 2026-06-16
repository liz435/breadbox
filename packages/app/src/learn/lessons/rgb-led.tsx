import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function RgbLedLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="RGB LED Color Cycle"
        subtitle="Control red, green, and blue channels independently with PWM."
      
        badge={<DifficultyBadge difficulty="beginner" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A common-cathode <Term k="led">RGB LED</Term> whose red, green, and blue anodes
          are each driven by a separate PWM pin through a 220{"\u03a9"} <Term k="resistor" />.
          The sketch cycles through red, green, and blue, pausing one second on each color.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="04-rgb-led" panels={["code"]} height={440} />
        <Note>
          Press <strong>Play</strong> and watch the LED step through red, green, and blue.
          Try editing the <code className="text-foreground">analogWrite</code> values to blend
          intermediate colors.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          An RGB LED packages three LEDs — red, green, and blue — into one housing, sharing a
          single common-cathode pin tied to ground. The sketch calls{" "}
          <Term k="analog-write">
            <code className="text-foreground">analogWrite(pin, value)</code>
          </Term>{" "}
          on each color pin. A value of <code className="text-foreground">255</code> drives that
          channel at full brightness; <code className="text-foreground">0</code> turns it off.
        </p>
        <p className="text-sm leading-relaxed">
          Red, green, and blue are connected to pins 9, 10, and 11 — all{" "}
          <Term k="pwm">PWM-capable pins</Term> on the Uno. The{" "}
          <code className="text-foreground">setup()</code> function declares each as an
          output, and <code className="text-foreground">loop()</code> steps through the three
          solid colors with one-second pauses.
        </p>
      </Section>

      <Section title="Why three resistors?">
        <p className="text-sm leading-relaxed">
          Each LED element inside the RGB package has a different forward voltage: red is
          around 2 V, while blue and green are closer to 3 V. All three share the same
          220{"\u03a9"} resistor value here for simplicity, which keeps the current in a safe range
          for all channels. In a precision color application you would tune each resistor
          to match its element's <Term k="forward-voltage" />, but for learning the concept
          equal values work fine.
        </p>
      </Section>

      <LessonFooter currentSlug="rgb-led" />
    </LearnLayout>
  )
}

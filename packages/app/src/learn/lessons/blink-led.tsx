import { LearnLayout, LessonFooter, PageTitle, Section, Note } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function BlinkLedLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Blink an LED"
        subtitle="Your first Arduino circuit — turn a light on and off."
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          An <Term k="led" /> wired to pin{" "}
          <span className="text-foreground font-mono">D13</span> that blinks once per
          second. The circuit has an LED, a 220Ω{" "}
          <Term k="resistor" /> (to limit current so the LED doesn't burn out),
          and two wires.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="01-blink-led" panels={["code"]} height={440} />
        <Note>
          Press <strong>Play</strong> to run the sketch. The LED should blink every half
          second. The read-only <em>Sketch</em> panel on the right shows the code that's
          running.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          The Arduino <code className="text-foreground">setup()</code> function runs once
          when the board powers on. It calls{" "}
          <Term k="pin-mode">
            <code className="text-foreground">pinMode(13, OUTPUT)</code>
          </Term>{" "}
          to tell pin 13 that it will be driving a signal out to the LED.
        </p>
        <p className="text-sm leading-relaxed">
          The <code className="text-foreground">loop()</code> function runs over and over,
          forever. It{" "}
          <Term k="digital-write">sets pin 13 HIGH</Term> (turning the LED on), waits
          500 milliseconds, sets pin 13 LOW (turning it off), and waits another
          500 ms. The result: a steady 1 Hz blink.
        </p>
      </Section>

      <Section title="Why the resistor?">
        <p className="text-sm leading-relaxed">
          LEDs are low-resistance devices — if you connected one directly to 5V, it
          would draw too much current and burn out almost instantly. A{" "}
          <strong>current-limiting resistor</strong> (220Ω is a common choice) keeps
          the current at a safe level (around 15–20 mA) for a typical LED. See{" "}
          <Term k="ohms-law" /> for the math, or the{" "}
          <Term k="led">LED reference page</Term> for the full story on why Vf
          matters.
        </p>
      </Section>

      <LessonFooter currentSlug="blink-led" />
    </LearnLayout>
  )
}

import { LearnLayout, LessonFooter, PageTitle, Section, Note } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"

export function BlinkLedLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Blink an LED"
        subtitle="Your first Arduino circuit — turn a light on and off."
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          An LED wired to pin <span className="text-gray-200 font-mono">D13</span> that
          blinks once per second. The circuit has an LED, a 220Ω resistor (to limit
          current so the LED doesn't burn out), and two wires.
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
          The Arduino <code className="text-gray-200">setup()</code> function runs once
          when the board powers on. It calls{" "}
          <code className="text-gray-200">pinMode(13, OUTPUT)</code> to tell pin 13 that
          it will be driving a signal out to the LED.
        </p>
        <p className="text-sm leading-relaxed">
          The <code className="text-gray-200">loop()</code> function runs over and over,
          forever. It sets pin 13 HIGH (turning the LED on), waits 500 milliseconds,
          sets pin 13 LOW (turning it off), and waits another 500 ms. The result: a
          steady 1 Hz blink.
        </p>
      </Section>

      <Section title="Why the resistor?">
        <p className="text-sm leading-relaxed">
          LEDs are low-resistance devices — if you connected one directly to 5V, it
          would draw too much current and burn out almost instantly. A{" "}
          <strong>current-limiting resistor</strong> (220Ω is a common choice) keeps
          the current at a safe level (around 15–20 mA) for a typical LED.
        </p>
      </Section>

      <LessonFooter currentSlug="blink-led" />
    </LearnLayout>
  )
}

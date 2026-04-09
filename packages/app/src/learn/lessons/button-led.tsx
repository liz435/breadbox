import { LearnLayout, LessonFooter, PageTitle, Section, Note } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"

export function ButtonLedLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Read a Button"
        subtitle="Light up an LED when a push-button is pressed."
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A push-button wired to pin <span className="text-gray-200 font-mono">D2</span>{" "}
          with Arduino's built-in pull-up resistor, plus an LED on pin{" "}
          <span className="text-gray-200 font-mono">D13</span> that turns on whenever
          the button is held down.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="02-button-led" panels={["code"]} height={500} />
        <Note>
          Click and hold the push-button on the breadboard to see the green LED light
          up. Release to turn it off.
        </Note>
      </Section>

      <Section title="Digital input with INPUT_PULLUP">
        <p className="text-sm leading-relaxed">
          A floating digital input pin picks up random noise — it could read HIGH or
          LOW unpredictably. To avoid this, every Arduino pin has an internal{" "}
          <strong>pull-up resistor</strong> you can enable with{" "}
          <code className="text-gray-200">pinMode(2, INPUT_PULLUP)</code>. When
          enabled, the pin sits at HIGH by default.
        </p>
        <p className="text-sm leading-relaxed">
          The button is wired between pin 2 and ground. Pressing the button connects
          pin 2 to ground, pulling the input LOW. So:
        </p>
        <ul className="text-sm leading-relaxed list-disc pl-5 space-y-1">
          <li><strong>Not pressed:</strong> pin 2 reads HIGH (pulled up internally)</li>
          <li><strong>Pressed:</strong> pin 2 reads LOW (pulled down by the button to GND)</li>
        </ul>
        <p className="text-sm leading-relaxed">
          This is why the <code className="text-gray-200">loop()</code> checks{" "}
          <code className="text-gray-200">if (digitalRead(2) == LOW)</code> — LOW
          means pressed.
        </p>
      </Section>

      <Section title="Why it's polled in the loop">
        <p className="text-sm leading-relaxed">
          The Arduino keeps running <code className="text-gray-200">loop()</code>{" "}
          thousands of times per second. Each time through, it checks the button state
          and updates the LED. This "poll-and-react" pattern is the simplest way to
          handle inputs, and it's plenty fast for human interaction.
        </p>
      </Section>

      <LessonFooter currentSlug="button-led" />
    </LearnLayout>
  )
}

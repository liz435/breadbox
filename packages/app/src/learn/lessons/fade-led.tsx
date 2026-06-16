import { LearnLayout, LessonFooter, PageTitle, Section, Note } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function FadeLedLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Fade an LED (PWM)"
        subtitle="Smoothly dim an LED using analogWrite() and a for loop."
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          An <Term k="led" /> on pin{" "}
          <span className="text-foreground font-mono">D9</span> that fades
          up from off to full brightness, then fades back down, over and over. Unlike
          the previous lesson where pin 13 was either fully on or fully off, this
          lesson uses <Term k="pwm">PWM</Term> (pulse-width modulation) to make
          the LED appear to be at intermediate brightness levels.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="03-fade-led" panels={["code"]} height={480} />
        <Note>
          Press <strong>Play</strong> and watch the LED fade smoothly. This is the same
          circuit as Lesson 1, just wired to a different pin — the magic is all in
          the sketch.
        </Note>
      </Section>

      <Section title="What is PWM?">
        <p className="text-sm leading-relaxed">
          Digital pins can only output HIGH (5V) or LOW (0V) — they can't actually
          produce 2.5V. Pulse-width modulation fakes analog output by switching the
          pin on and off very quickly. If the pin is HIGH for 50% of the time and
          LOW for 50% (a <Term k="duty-cycle">50% duty cycle</Term>), the LED's
          average brightness looks like half.
        </p>
        <p className="text-sm leading-relaxed">
          <Term k="analog-write">
            <code className="text-foreground">analogWrite(pin, value)</code>
          </Term>{" "}
          takes a value from <code className="text-foreground">0</code> (always off)
          to <code className="text-foreground">255</code> (always on). Anything in
          between produces a proportionally bright output.
        </p>
      </Section>

      <Section title="Not every pin supports PWM">
        <p className="text-sm leading-relaxed">
          On the Arduino Uno, only pins <span className="font-mono text-foreground">3, 5, 6, 9, 10,</span>{" "}
          and <span className="font-mono text-foreground">11</span> support{" "}
          <code className="text-foreground">analogWrite()</code>. These are the ones
          marked with a <span className="text-foreground font-mono">~</span> on a real
          board. We're using pin 9 here — try changing it to pin 8 in the editor and
          watch the LED snap instead of fade.
        </p>
      </Section>

      <Section title="The fade algorithm">
        <p className="text-sm leading-relaxed">
          The sketch keeps two variables: <code className="text-foreground">brightness</code>{" "}
          (current PWM value) and <code className="text-foreground">fadeAmount</code>{" "}
          (how much to change it each loop). Each iteration:
        </p>
        <ol className="text-sm leading-relaxed list-decimal pl-5 space-y-1">
          <li>Write the current brightness to pin 9.</li>
          <li>Add <code className="text-foreground">fadeAmount</code> to{" "}
            <code className="text-foreground">brightness</code>.</li>
          <li>When brightness hits either end (0 or 255), flip the sign of{" "}
            <code className="text-foreground">fadeAmount</code> so it starts going
            back the other way.</li>
          <li>Delay 30 ms before the next update.</li>
        </ol>
        <p className="text-sm leading-relaxed">
          The full cycle is about (255 / 5) × 30 ms × 2 ≈ 3 seconds from dark to
          bright and back.
        </p>
      </Section>

      <LessonFooter currentSlug="fade-led" />
    </LearnLayout>
  )
}

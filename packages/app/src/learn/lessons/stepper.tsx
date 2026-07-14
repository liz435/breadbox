import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge, Warn } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"

export function StepperLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Drive a Stepper Motor"
        subtitle="Turn a 28BYJ-48 stepper a precise number of steps with the Stepper library."
        badge={<DifficultyBadge difficulty="advanced" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A 28BYJ-48 stepper motor driven through a ULN2003 driver board. Four control
          lines — <code className="text-foreground">IN1–IN4</code> on pins{" "}
          <code className="text-foreground">D8–D11</code> — energise the motor's coils in
          sequence, and the driver board's <code className="text-foreground">V+</code>/
          <code className="text-foreground">GND</code> supply the coil current. The sketch
          turns the shaft one full revolution clockwise, then one back.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="23-stepper" panels={["code"]} height={460} />
        <Note>
          Press <strong>Play</strong>. Unlike a DC motor, a stepper moves in discrete
          steps — the shaft advances one step for every change in the coil pattern, so its
          position is always known without any feedback sensor.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          A stepper has several coils spaced around the rotor. Energising them in the right
          order creates a magnetic field that steps around the circle, and the rotor
          follows it one step at a time. The <code className="text-foreground">Stepper</code>{" "}
          library does the sequencing for you: <code className="text-foreground">step(n)</code>{" "}
          advances <code className="text-foreground">n</code> steps (negative reverses),
          and <code className="text-foreground">setSpeed()</code> sets how fast in RPM.
        </p>
        <p className="text-sm leading-relaxed">
          The 28BYJ-48 has an internal 1/64 gearbox, so it takes about{" "}
          <code className="text-foreground">2048</code> steps for one turn of the output
          shaft — which is why the constant is passed to both{" "}
          <code className="text-foreground">Stepper(...)</code> and{" "}
          <code className="text-foreground">step(...)</code>.
        </p>
      </Section>

      <Note>
        The coil order for the 28BYJ-48 with <code className="text-foreground">Stepper.h</code>{" "}
        is <code className="text-foreground">IN1, IN3, IN2, IN4</code> — note the swapped
        middle pair. Wiring the pins in plain 1-2-3-4 order makes the motor buzz without
        turning.
      </Note>

      <Warn>
        The ULN2003 draws its coil current from <code className="text-foreground">V+</code>,
        not from the Arduino's pins — the IN lines only switch the driver. A 28BYJ-48 runs
        from the 5 V rail; larger steppers need their own supply.
      </Warn>

      <LessonFooter currentSlug="stepper" />
    </LearnLayout>
  )
}

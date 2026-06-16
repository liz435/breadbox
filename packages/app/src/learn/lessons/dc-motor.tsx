import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge, Warn } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function DcMotorLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Control Motor Speed with PWM"
        subtitle="Ramp a DC motor up and down by varying the PWM duty cycle."
      
        badge={<DifficultyBadge difficulty="advanced" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A DC motor driven through a driver circuit on pin{" "}
          <code className="text-foreground">D9</code>. The sketch ramps{" "}
          <Term k="analog-write">
            <code className="text-foreground">analogWrite()</code>
          </Term>{" "}
          from 0 to 255 in steps of 5 (speeding up), then back down to 0 (slowing to a
          stop), repeating continuously.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="19-dc-motor" panels={["code"]} height={460} />
        <Note>
          Press <strong>Play</strong>. The motor icon in the embed shows the simulated
          rotation speed changing as the sketch ramps up and down.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          <Term k="pwm">PWM</Term> controls average power to the motor by switching the
          drive signal on and off rapidly. At a{" "}
          <Term k="duty-cycle">50% duty cycle</Term> (value 127), the motor receives power
          half the time, which — for a resistive/inductive load — averages to roughly
          half the supply voltage and proportionally less torque. At 255 (always on), the
          motor runs at full speed.
        </p>
        <p className="text-sm leading-relaxed">
          Two nested <code className="text-foreground">for</code> loops step the value up
          and then down in increments of 5. A 30 ms{" "}
          <Term k="delay">delay</Term> between steps slows the ramp enough to see the
          speed change.
        </p>
      </Section>

      <Warn>
        DC motors draw significantly more current than an Arduino pin can supply. Always
        drive them through a transistor, MOSFET, or motor driver IC (such as the L298N).
        This lesson uses a simulated driver — connect the real motor to the driver's
        output, not directly to the pin.
      </Warn>

      <Section title="Why not connect the motor straight to the pin?">
        <p className="text-sm leading-relaxed">
          A small DC motor can draw hundreds of milliamps under load. An Arduino pin
          maxes out at 40 mA — enough to destroy the pin or even the entire ATmega chip
          if exceeded. A <Term k="mosfet">MOSFET</Term> or dedicated motor driver acts
          as an amplifier: the Arduino's tiny control signal switches the driver, which
          draws the motor's full current from an external power supply.
        </p>
      </Section>

      <LessonFooter currentSlug="dc-motor" />
    </LearnLayout>
  )
}

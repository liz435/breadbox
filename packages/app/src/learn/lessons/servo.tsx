import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function ServoLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Sweep a Servo Motor"
        subtitle="Rotate a hobby servo from 0 to 180 degrees using the Servo library."
      
        badge={<DifficultyBadge difficulty="intermediate" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A standard hobby servo connected to pin{" "}
          <code className="text-foreground">D9</code> that sweeps smoothly from 0{"\u00b0"}
          to 180{"\u00b0"} and back, one degree at a time. The Arduino's built-in{" "}
          <code className="text-foreground">Servo</code> library handles the timing signal.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="10-servo" panels={["code"]} height={460} />
        <Note>
          Press <strong>Play</strong> and watch the servo arm sweep back and forth. The
          servo in the simulator animates its rotation.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          Servos use a control signal called PWM at a fixed 50 Hz rate. The pulse width —
          how long the signal stays HIGH each cycle — tells the motor what angle to hold.
          A 1 ms pulse means 0{"\u00b0"}; 2 ms means 180{"\u00b0"}. The{" "}
          <code className="text-foreground">Servo</code> library abstracts all of this: you
          call <code className="text-foreground">myServo.attach(9)</code> once in{" "}
          <code className="text-foreground">setup()</code>, and then{" "}
          <code className="text-foreground">myServo.write(angle)</code> anywhere in{" "}
          <code className="text-foreground">loop()</code> to set the position in degrees.
        </p>
        <p className="text-sm leading-relaxed">
          The two <code className="text-foreground">for</code> loops increment and then
          decrement the angle one degree at a time with a 15 ms pause between steps —
          just slow enough to see the motion clearly.
        </p>
      </Section>

      <Section title="Why not use analogWrite() for a servo?">
        <p className="text-sm leading-relaxed">
          <Term k="analog-write">
            <code className="text-foreground">analogWrite()</code>
          </Term>{" "}
          runs at ~490 Hz or ~980 Hz on the Uno — far too fast for a servo, which expects
          50 Hz. The <code className="text-foreground">Servo</code> library uses hardware
          timers to generate the exact 50 Hz signal with the correct microsecond pulse
          width the motor's controller chip expects.
        </p>
      </Section>

      <LessonFooter currentSlug="servo" />
    </LearnLayout>
  )
}

import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function UltrasonicSensorLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Measure Distance (HC-SR04)"
        subtitle="Calculate distance in centimeters from an ultrasonic pulse round-trip."
      
        badge={<DifficultyBadge difficulty="intermediate" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          An HC-SR04 ultrasonic sensor with its TRIG pin on{" "}
          <code className="text-foreground">D7</code> and ECHO on{" "}
          <code className="text-foreground">D8</code>. The sketch fires a 10 {"\u03bc"}s
          ultrasonic pulse, times the echo, converts the duration to centimeters, and
          prints the result to Serial.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="12-ultrasonic-sensor" panels={["code", "serial"]} height={520} />
        <Note>
          Press <strong>Play</strong>. Distance readings appear in the Serial panel. Use
          the sensor's slider in the simulator to set the simulated object distance.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          The sketch follows a fixed four-step protocol on every measurement:
        </p>
        <ol className="text-sm leading-relaxed list-decimal pl-5 space-y-1">
          <li>Pull TRIG LOW for 2 {"\u03bc"}s to clean up any previous signal.</li>
          <li>Pull TRIG HIGH for 10 {"\u03bc"}s — the sensor fires an 8-pulse 40 kHz burst.</li>
          <li>Pull TRIG LOW again. The sensor takes over and raises ECHO HIGH.</li>
          <li>
            <code className="text-foreground">pulseIn(echoPin, HIGH)</code> measures how long
            ECHO stays HIGH in microseconds.
          </li>
        </ol>
        <p className="text-sm leading-relaxed">
          Distance (cm) = duration (µs) / 58. The divisor comes from the speed of sound
          (~343 m/s) and the fact that the pulse travels to the object and back
          (two-way trip).
        </p>
      </Section>

      <Section title="Why not use Serial.println() for everything?">
        <p className="text-sm leading-relaxed">
          The sketch uses <code className="text-foreground">Serial.print()</code> for the
          label and{" "}
          <code className="text-foreground">Serial.println()</code> for the value so they
          appear on the same line. <code className="text-foreground">println()</code> appends
          a newline character; <code className="text-foreground">print()</code> does not.
          Mixing them gives you human-readable output without a blank line between every
          reading.
        </p>
      </Section>

      <LessonFooter currentSlug="ultrasonic-sensor" />
    </LearnLayout>
  )
}

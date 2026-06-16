import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function PirSensorLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Detect Motion with PIR"
        subtitle="Trigger an LED when a passive infrared sensor detects movement."
      
        badge={<DifficultyBadge difficulty="intermediate" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A PIR (passive infrared) motion sensor wired to pin{" "}
          <code className="text-foreground">D2</code> and an{" "}
          <Term k="led" /> on <code className="text-foreground">D13</code>. When the
          sensor detects movement, the LED lights and a message is printed to Serial.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="13-pir-sensor" panels={["code", "serial"]} height={520} />
        <Note>
          Press <strong>Play</strong>, then click the PIR sensor in the embed to toggle
          motion on and off. Watch the LED respond and check the Serial panel for messages.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          The PIR sensor outputs a digital HIGH on its OUT pin whenever it detects
          infrared radiation from a moving warm body. The sketch configures pin 2 as an
          input and reads it with{" "}
          <Term k="digital-read">
            <code className="text-foreground">digitalRead(pirPin)</code>
          </Term>{" "}
          each time through <code className="text-foreground">loop()</code>. If the reading
          is HIGH, it turns the LED on and prints a message; if LOW, it turns the LED off.
        </p>
      </Section>

      <Section title="Why poll instead of using an interrupt?">
        <p className="text-sm leading-relaxed">
          A PIR sensor's output stays HIGH for several seconds after detecting motion —
          typically 5–10 seconds depending on the module's trim pot. Polling at 200 ms
          intervals is more than fast enough to catch that window without missing an event.
          Interrupts shine when a signal changes in microseconds (like a rotary encoder).
          For slow digital events like PIR, polling keeps the sketch simpler with no
          loss of reliability.
        </p>
      </Section>

      <LessonFooter currentSlug="pir-sensor" />
    </LearnLayout>
  )
}

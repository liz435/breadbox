import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function BuzzerLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Play a Melody with a Buzzer"
        subtitle="Generate musical tones on a piezo buzzer using the tone() function."
      
        badge={<DifficultyBadge difficulty="intermediate" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A piezo buzzer on pin <code className="text-foreground">D8</code> that plays a
          three-note melody — C4, E4, and G4 — repeating continuously. No library is
          needed; Arduino's built-in{" "}
          <Term k="tone">
            <code className="text-foreground">tone()</code>
          </Term>{" "}
          function does the work.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="09-buzzer" panels={["code"]} height={440} />
        <Note>
          Press <strong>Play</strong>. The simulator generates audio — make sure your
          browser tab is not muted.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          <code className="text-foreground">tone(pin, frequency)</code> tells the Arduino
          to produce a square wave at the given frequency in Hz on the specified pin. The
          buzzer converts that electrical oscillation into sound. The three notes in the
          sketch use standard musical frequencies: 262 Hz (C4), 330 Hz (E4), 392 Hz (G4).
        </p>
        <p className="text-sm leading-relaxed">
          Each <code className="text-foreground">tone()</code> call is followed by a{" "}
          <Term k="delay">
            <code className="text-foreground">delay(500)</code>
          </Term>{" "}
          to let the note ring, and then{" "}
          <code className="text-foreground">noTone(pin)</code> stops it before the next note
          starts. The final <code className="text-foreground">delay(1000)</code> creates a
          rest between melody repetitions.
        </p>
      </Section>

      <Section title="Why does pitch equal frequency?">
        <p className="text-sm leading-relaxed">
          Sound is pressure waves in air. The rate of those waves — the frequency in Hz —
          is what our ears perceive as pitch. The buzzer's thin piezo disk vibrates at
          whatever rate the pin oscillates, so controlling the{" "}
          <Term k="pwm">square wave</Term> frequency directly controls the note played.
          Double the frequency and the pitch rises exactly one octave.
        </p>
      </Section>

      <LessonFooter currentSlug="buzzer" />
    </LearnLayout>
  )
}

// Arduino Programming > Arduino API > Tone output

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function ToneApiPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "tone",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Tone output"
        subtitle="Driving a piezo buzzer with square waves, using tone() and noTone()."
      />

      <Section title="The API">
        <p className="text-sm leading-relaxed">
          <Term k="tone" /> generates a square wave of the requested
          frequency on a digital pin. It's the standard way to make
          noise on an Arduino — wire a piezo buzzer between the pin
          and ground (with a current-limiting resistor if the buzzer
          doesn't have one built in) and you can play notes.
        </p>

        <CodeBlock code={`tone(pin, frequency);             // plays until noTone()
tone(pin, frequency, duration);   // plays for duration ms
noTone(pin);                      // stop whatever is playing`} />
      </Section>

      <Section title="Playing a note">
        <CodeBlock code={`const int BUZZER_PIN = 8;

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
}

void loop() {
  tone(BUZZER_PIN, 440);    // A4
  delay(500);
  tone(BUZZER_PIN, 523);    // C5
  delay(500);
  noTone(BUZZER_PIN);
  delay(1000);
}`} />
      </Section>

      <Section title="One tone at a time">
        <p className="text-sm leading-relaxed">
          Under the hood <code>tone()</code> uses{" "}
          <em className="text-gray-200">Timer 2</em> on the Uno. Only
          one pin can be generating a tone at any given moment — calling{" "}
          <code>tone()</code> on a different pin before calling{" "}
          <code>noTone()</code> cancels the first one. You cannot play
          two simultaneous notes from a single Arduino without extra
          hardware.
        </p>

        <Warn>
          <code>tone()</code> hogs Timer 2, which is the same timer
          <code>analogWrite()</code> uses for PWM on pins 3 and 11.
          While a tone is playing, PWM on those pins is disabled.
        </Warn>

        <Note>
          The frequency range that sounds clean on a typical piezo is
          roughly 100 Hz to 5 kHz. Below that it buzzes, above that
          it's shrill or inaudible.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/pwm",
          "board/timers",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// Arduino Programming > Arduino API > Tone output

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  Figure,
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

        <Figure caption="tone(pin, 440) outputs a 440 Hz square wave — the pin flips between 0 V and 5 V 880 times a second.">
          <ToneWaveDiagram />
        </Figure>
      </Section>

      <Section title="One tone at a time">
        <p className="text-sm leading-relaxed">
          Under the hood <code>tone()</code> uses{" "}
          <em className="text-foreground">Timer 2</em> on the Uno. Only
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

// ── Tone square-wave diagram ───────────────────────────────────────────

function ToneWaveDiagram() {
  const w = 500
  const h = 180
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const hi = 50
  const lo = 130
  const startX = 60
  const endX = 470
  const cycles = 5
  const cycleW = (endX - startX) / cycles
  const points: string[] = []
  for (let i = 0; i < cycles; i++) {
    const cx = startX + i * cycleW
    points.push(`${cx},${hi}`)
    points.push(`${cx + cycleW / 2},${hi}`)
    points.push(`${cx + cycleW / 2},${lo}`)
    points.push(`${cx + cycleW},${lo}`)
  }
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        <text x={w / 2} y={25} textAnchor="middle" fontSize={12} fill="#a78bfa" fontFamily={mono}>440 Hz (A4) — square wave</text>

        {/* Rails */}
        <line x1={startX - 10} y1={hi} x2={endX} y2={hi} stroke="#27272a" strokeWidth={1} strokeDasharray="3,3" />
        <line x1={startX - 10} y1={lo} x2={endX} y2={lo} stroke="#27272a" strokeWidth={1} strokeDasharray="3,3" />
        <text x={startX - 15} y={hi + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily={mono}>5V</text>
        <text x={startX - 15} y={lo + 4} textAnchor="end" fontSize={10} fill="#9ca3af" fontFamily={mono}>0V</text>

        <polyline points={points.join(" ")} fill="none" stroke="#60a5fa" strokeWidth={2.5} />

        {/* Period marker */}
        <line x1={startX} y1={155} x2={startX + cycleW} y2={155} stroke="#10b981" strokeWidth={1.5} />
        <line x1={startX} y1={152} x2={startX} y2={158} stroke="#10b981" strokeWidth={1.5} />
        <line x1={startX + cycleW} y1={152} x2={startX + cycleW} y2={158} stroke="#10b981" strokeWidth={1.5} />
        <text x={startX + cycleW / 2} y={170} textAnchor="middle" fontSize={9} fill="#10b981" fontFamily={mono}>T ≈ 2.27 ms</text>
      </svg>
    </div>
  )
}

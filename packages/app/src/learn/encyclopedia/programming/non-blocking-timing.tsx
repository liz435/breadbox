// Arduino Programming > Patterns > Non-blocking timing with millis()

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "../../term"

export function NonBlockingTimingPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "non-blocking-timing",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Non-blocking timing with millis()"
        subtitle="Do two things at once — without threads, without delay."
      />

      <Section title="Why delay() isn't enough">
        <p className="text-sm leading-relaxed">
          The classic blink sketch uses <Term k="delay">delay()</Term>.
          It works, but the sketch can't do anything else during those
          500 ms — buttons won't respond, sensors go unread, Serial
          stalls. The non-blocking millis() pattern is the fix.
        </p>
      </Section>

      <Section title="The pattern">
        <p className="text-sm leading-relaxed">
          Instead of waiting, you:
        </p>
        <ol className="mt-2 space-y-1 text-sm leading-relaxed list-decimal pl-5">
          <li>Remember when you last did the thing (a timestamp).</li>
          <li>Each loop pass, ask <Term k="millis">millis()</Term> for the current time.</li>
          <li>If enough time has passed, do the thing and save the new timestamp.</li>
          <li>Otherwise, fall through — the rest of <code>loop()</code> runs normally.</li>
        </ol>
      </Section>

      <Section title="Blink, non-blocking">
        <CodeBlock code={`const int LED_PIN = 13;
const unsigned long INTERVAL = 500;

unsigned long lastToggle = 0;
bool ledOn = false;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  unsigned long now = millis();

  if (now - lastToggle >= INTERVAL) {
    lastToggle = now;
    ledOn = !ledOn;
    digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
  }

  // Anything else can run here — buttons, sensors, Serial.
}`} />

        <BreadboardEmbed board="01-blink-led" panels={["code"]} height={420} />
      </Section>

      <Section title="Why unsigned long, and why subtract?">
        <p className="text-sm leading-relaxed">
          <code>millis()</code> returns an <code>unsigned long</code>{" "}
          and wraps back to zero after ~50 days of runtime. The form{" "}
          <code>now - lastToggle</code> keeps working across the wrap
          because unsigned subtraction in C++ is well-defined: it comes
          out to the correct elapsed time as long as the interval is
          less than ~50 days. Don't write{" "}
          <code>if (now &gt;= lastToggle + INTERVAL)</code> — that can
          fail around the wrap.
        </p>

        <Note>
          Once this clicks, you can run as many independent "tasks" as
          you like in one sketch — each with its own{" "}
          <code>lastX</code> timestamp and interval. This is Arduino's
          answer to threads.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/timing",
          "board/timers",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

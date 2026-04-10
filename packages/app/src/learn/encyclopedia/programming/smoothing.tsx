// Arduino Programming > Patterns > Smoothing noisy analog reads

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

export function SmoothingPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "smoothing",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Smoothing noisy analog reads"
        subtitle="When analogRead() jitters by a few counts, average it out before your sketch reacts."
      />

      <Section title="Why readings jitter">
        <p className="text-sm leading-relaxed">
          A 10-bit ADC on a noisy 5 V rail is lucky to have eight
          stable bits. Even a motionless potentiometer will wander
          by a count or two, and light sensors or microphones are
          much worse. Acting on the raw value means your LED
          flickers or your servo twitches even when nothing has
          changed. The fix is to average several recent readings
          so short-lived jitter gets squashed without losing the
          real underlying signal.
        </p>
      </Section>

      <Section title="Moving average">
        <p className="text-sm leading-relaxed">
          Keep the last N readings in a ring buffer, sum them,
          divide by N. Every new read evicts the oldest sample.
          The output is delayed by roughly half the window, but
          the filter is simple and predictable.
        </p>

        <CodeBlock code={`const int WINDOW = 8;
int samples[WINDOW];
int index = 0;
long total = 0;

void setup() {
  for (int i = 0; i < WINDOW; i = i + 1) {
    samples[i] = 0;
  }
}

int smoothedRead(int pin) {
  total = total - samples[index];
  samples[index] = analogRead(pin);
  total = total + samples[index];
  index = index + 1;
  if (index >= WINDOW) index = 0;
  return total / WINDOW;
}`} />
      </Section>

      <Section title="Exponential smoothing">
        <p className="text-sm leading-relaxed">
          No buffer, no index, one line of math. Keep a running
          <code>smoothed</code> value and blend each new reading
          into it with a weight between 0 and 1. A small weight
          (0.1) is heavy smoothing; a larger weight (0.5) barely
          smooths at all.
        </p>

        <CodeBlock code={`float smoothed = 0;
const float alpha = 0.1;

int smoothedRead(int pin) {
  int raw = analogRead(pin);
  smoothed = alpha * raw + (1.0 - alpha) * smoothed;
  return (int) smoothed;
}`} />

        <Note>
          Use the moving average when you want a clear, bounded
          delay and don't mind the memory. Use exponential
          smoothing when RAM matters or when you want a single
          knob (<code>alpha</code>) to control how aggressive the
          filter is.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/analog-io",
          "electronics/analog-vs-digital",
          "programming/arrays",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

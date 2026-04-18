import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge, Warn } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function RelayLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Toggle a Relay"
        subtitle="Use a relay to switch loads that Arduino pins cannot drive directly."
      
        badge={<DifficultyBadge difficulty="advanced" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A 5 V relay module wired to pin <code className="text-gray-200">D7</code>. The
          sketch alternates between HIGH and LOW every 2 seconds, toggling the relay's
          coil and clicking its mechanical contacts open and closed.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="18-relay" panels={["code"]} height={460} />
        <Note>
          Press <strong>Play</strong>. Watch the relay component toggle its state every
          2 seconds.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          A <Term k="relay" /> is an electromagnetically controlled mechanical switch. When
          the Arduino pin drives the relay module's IN pin HIGH, current flows through the
          relay coil and generates a magnetic field that snaps the switch contacts closed.
          Writing LOW de-energizes the coil and a spring returns the contacts to their
          resting position (normally open or normally closed, depending on which terminals
          you use).
        </p>
        <p className="text-sm leading-relaxed">
          Relay modules include a flyback diode and transistor driver on-board, so the
          Arduino pin only needs to source a few milliamps to the module's logic input —
          well within the pin's 40 mA limit.
        </p>
      </Section>

      <Warn>
        In a real circuit, the relay's switched contacts can control mains voltage (120 V
        / 240 V AC) or high-current DC loads. Always verify your relay's contact rating
        before connecting it to line voltage, and never work on a live mains circuit
        without proper safety equipment.
      </Warn>

      <Section title="Why not drive the load directly from an Arduino pin?">
        <p className="text-sm leading-relaxed">
          An Arduino digital pin can safely source or sink around 20 mA continuously and
          40 mA absolute maximum. Most real-world loads — motors, lamps, solenoids,
          appliances — draw far more than that, and many run on voltages the Arduino
          cannot provide. A <Term k="relay" /> or <Term k="transistor" /> acts as an
          electronically controlled switch, letting a tiny control signal switch a much
          larger load circuit.
        </p>
      </Section>

      <LessonFooter currentSlug="relay" />
    </LearnLayout>
  )
}

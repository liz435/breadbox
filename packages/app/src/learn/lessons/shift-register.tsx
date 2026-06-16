import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function ShiftRegisterLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="LED Chaser with 74HC595"
        subtitle="Expand digital outputs by shifting bits through a serial-to-parallel register."
      
        badge={<DifficultyBadge difficulty="advanced" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A 74HC595 shift register wired to three Arduino pins (data, clock, latch) and
          driving eight LEDs. The sketch uses{" "}
          <code className="text-foreground">shiftOut()</code> to send one byte at a time,
          chasing a single lit LED across all eight outputs.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="20-shift-register" panels={["code", "schematic"]} height={540} />
        <Note>
          Press <strong>Play</strong>. One LED at a time lights and chases through the
          eight positions. The Schematic panel shows the data path from the Arduino to
          the register's outputs.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          The 74HC595 is an 8-bit serial-in, parallel-out shift register. The sketch
          communicates with it using three pins:
        </p>
        <ul className="text-sm leading-relaxed list-disc pl-5 space-y-1">
          <li>
            <strong>Data (pin 8):</strong> one bit of the byte to send, presented before
            each clock edge.
          </li>
          <li>
            <strong>Clock (pin 11):</strong> each rising edge shifts one bit into the
            register's internal storage.
          </li>
          <li>
            <strong>Latch (pin 12):</strong> a HIGH pulse copies the internal storage to
            the eight output pins all at once, so the LEDs update simultaneously.
          </li>
        </ul>
        <p className="text-sm leading-relaxed">
          The built-in{" "}
          <code className="text-foreground">shiftOut(dataPin, clockPin, MSBFIRST, byte)</code>{" "}
          function handles bit-banging the data and clock lines. Pulling latch LOW before
          <code className="text-foreground"> shiftOut()</code> and HIGH after it is the
          standard latch sequence.
        </p>
      </Section>

      <Section title="Why use a shift register instead of more Arduino pins?">
        <p className="text-sm leading-relaxed">
          The Uno only exposes 14 digital pins. Controlling 8 LEDs directly would
          consume 8 of them, leaving little room for sensors and other outputs. One
          74HC595 uses only 3 pins to drive 8 outputs. You can chain multiple 595s in
          series — connecting the first chip's serial output to the second's data input —
          to drive 16, 24, or 32 outputs from the same three control pins.
        </p>
      </Section>

      <LessonFooter currentSlug="shift-register" />
    </LearnLayout>
  )
}

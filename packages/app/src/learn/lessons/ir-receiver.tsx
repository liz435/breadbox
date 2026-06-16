import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function IrReceiverLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="Decode IR Remote Signals"
        subtitle="Capture and print the hex code from any infrared remote control button."
      
        badge={<DifficultyBadge difficulty="advanced" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A TSOP-type IR receiver module on pin{" "}
          <code className="text-foreground">D11</code> that decodes incoming IR pulses and
          prints the 32-bit hex code to Serial. Works with most consumer remote controls
          using the NEC, Sony, or RC5 protocols.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="17-ir-receiver" panels={["code", "serial"]} height={520} />
        <Note>
          Press <strong>Play</strong>, then click a button on the IR remote to beam a
          simulated IR code. The hex value prints in the Serial panel.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          IR remotes transmit data by switching a 38 kHz carrier on and off in precise
          patterns. The TSOP demodulator strips the carrier and outputs clean LOW pulses
          to the Arduino. The <code className="text-foreground">IRremote</code> library
          measures those pulse widths with a hardware timer interrupt and decodes them
          into a 32-bit code.
        </p>
        <p className="text-sm leading-relaxed">
          After a successful decode, the sketch prints the value in hex with{" "}
          <code className="text-foreground">Serial.println(results.value, HEX)</code> and
          calls <code className="text-foreground">irrecv.resume()</code> to prepare the
          library to receive the next code. Without that resume call, the receiver stays
          blocked on the first result.
        </p>
      </Section>

      <Section title="Why are IR codes shown in hex?">
        <p className="text-sm leading-relaxed">
          Remote control codes are 16 or 32-bit integers, and hexadecimal represents
          them in a compact, recognizable form. The NEC protocol, for example, encodes
          an 8-bit address and 8-bit command, making the hex value human-readable once
          you know your remote's address byte. Decimal representations of the same
          values would be far harder to compare.
        </p>
      </Section>

      <LessonFooter currentSlug="ir-receiver" />
    </LearnLayout>
  )
}

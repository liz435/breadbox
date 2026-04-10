// Arduino Uno Reference > Under the hood > The ATmega328P microcontroller

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function Atmega328pPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "atmega328p",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="The ATmega328P microcontroller"
        subtitle="The 28-pin chip in the centre of the board is the entire computer your sketch runs on."
      />

      <Section title="The chip under the hood">
        <p className="text-sm leading-relaxed">
          Almost everything on the Uno exists to support one chip: an
          Atmel (now Microchip) ATmega328P. It's an 8-bit AVR
          microcontroller running at 16 MHz, and every{" "}
          <code>digitalWrite</code>, every <code>analogRead</code>,
          every byte of <code>Serial.print</code> ends up as
          instructions executed by this single part.
        </p>
      </Section>

      <Section title="By the numbers">
        <Table
          headers={["Resource", "Amount", "Used for"]}
          rows={[
            ["Clock speed", "16 MHz", "One instruction per ~62.5 ns"],
            ["Flash", "32 KB", "Your compiled sketch + bootloader"],
            ["SRAM", "2 KB", "Variables, stack, heap"],
            [
              "EEPROM",
              "1 KB",
              "Non-volatile user data — see the EEPROM page",
            ],
            ["Digital I/O", "23 pins", "14 on the Uno header"],
            ["ADC channels", "6 × 10-bit", "Analog inputs A0–A5"],
            ["Operating voltage", "5 V", "Via the onboard regulator"],
          ]}
        />
      </Section>

      <Section title="Why the numbers matter">
        <p className="text-sm leading-relaxed">
          2 KB of SRAM is small. A single <code>String</code> that
          grows to a few hundred characters already eats a noticeable
          chunk, and the stack has to share what's left. 32 KB of
          flash is roomy for a sketch but tight for anything that
          bundles graphics or sound samples. When a sketch starts
          misbehaving mysteriously on a real Uno, low memory is
          usually the first suspect. The <Term k="eeprom" /> region
          is separate from both and survives power cycles.
        </p>

        <Note>
          Dreamer's simulator runs your sketch on the host CPU, not
          on a real ATmega328P, so you won't hit those memory limits
          in the editor. The numbers here describe the physical chip
          you'll program when you leave the simulator.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/clock-power",
          "programming/eeprom",
          "board/anatomy",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

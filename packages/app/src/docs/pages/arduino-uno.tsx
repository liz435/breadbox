import { DocsLayout, PageTitle, Section, Table, Note, Warn } from "@/docs/docs-layout"

export function ArduinoUnoPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Board Targets"
        subtitle="Breadbox supports Arduino Uno, Nano, and Mega 2560, plus the Raspberry Pi Pico (RP2040) — each with board-specific visuals, pin placement, and compile target."
      />

      <Section title="Supported Boards">
        <Table
          headers={["Board", "MCU", "Compile FQBN", "In-browser simulation"]}
          rows={[
            ["Arduino Uno R3", "ATmega328P @ 16 MHz", "arduino:avr:uno", "Full (avr8js) — WebSerial flash supported"],
            ["Arduino Nano", "ATmega328P @ 16 MHz", "arduino:avr:nano", "Full (avr8js)"],
            ["Arduino Mega 2560 Rev3", "ATmega2560 @ 16 MHz", "arduino:avr:mega", "Best-effort (avr8js) — Mega-only peripherals not modeled"],
            ["Raspberry Pi Pico", "RP2040 @ 125 MHz", "rp2040:rp2040:rpipico", "Best-effort (rp2040js) — GPIO-only, see note"],
          ]}
        />
        <Note>
          The <strong className="text-foreground">Raspberry Pi Pico</strong> runs on <code>rp2040js</code>,
          a lazy-loaded emulator chunk that only downloads when a Pico sketch runs. The real RP2040
          bootrom isn&apos;t bundled, so the boot handoff is synthesised: GPIO/SIO sketches execute, but
          PLL/clock-dependent timing, flash XIP, and USB-CDC <code>Serial</code> may misbehave. Flashing
          a real Pico uses UF2 (BOOTSEL drag-and-drop / WebUSB), not the WebSerial path the AVR boards use.
        </Note>
      </Section>

      <Section title="Pin Mapping in Breadbox">
        <Table
          headers={["Category", "Mapped pins", "Notes"]}
          rows={[
            ["Digital (AVR)", "D0–D13 on Uno/Nano, D0–D53 on Mega", "Mega pins 20–53 are wireable but not VM-modeled"],
            ["Analog (AVR)", "A0–A5 on all AVR targets", "Nano A6/A7 and Mega A6–A15 are wireable but not VM-simulated"],
            ["Pico (RP2040)", "GP0–GP28 as D0–D28; A0/A1/A2 on GP26/27/28", "GP29 (VSYS sense) is not exposed; GPIO-only in the live VM"],
            ["Power", "5V, 3V3, GND, VIN, RESET, AREF, IOREF (where present)", "NC pins are visual only"],
          ]}
        />
        <Note>
          Extra Nano/Mega pins are interactive for wiring and compile flows, and the Pico exposes its full
          GP header — but the in-browser live VM executes GPIO (and the Uno-compatible AVR subset) only.
        </Note>
      </Section>

      <Section title="Board-Specific Header Layouts">
        <Table
          headers={["Board", "Header style in canvas", "Notes"]}
          rows={[
            ["Uno", "Top digital header + bottom power/analog headers", "Matches classic Uno R3 board shape"],
            ["Nano", "Dual side headers (15 per side)", "Pins ordered like official Nano pinout (USB-at-top orientation)"],
            ["Mega 2560", "Top D0–D21 + lower D22–D53 + analog/power headers", "All shown Mega digital headers are interactive"],
            ["Raspberry Pi Pico", "Dual side headers (20 per side), DIP-40", "Green PCB, micro-USB at top, central RP2040 chip, BOOTSEL button, onboard LED on GP25"],
          ]}
        />
      </Section>

      <Section title="Electrical Safety Reminder">
        <Warn>
          Board selection changes compile target and board pin geometry. It does <strong>not</strong> increase
          safe current per pin. Use external supplies for servos/motors/high LED counts and always share GND.
          The Raspberry Pi Pico runs at <strong>3.3&nbsp;V logic and is not 5&nbsp;V-tolerant</strong> — never feed
          a 5&nbsp;V signal into a Pico GPIO.
        </Warn>
      </Section>

      <Section title="Official References">
        <p className="text-sm text-foreground leading-relaxed mb-2">
          Pin names and header ordering are based on the official Arduino and Raspberry Pi pinout references:
        </p>
        <ul className="list-disc pl-5 text-sm text-foreground space-y-1">
          <li><a href="https://docs.arduino.cc/resources/pinouts/A000066-full-pinout.pdf" className="text-blue-700 underline underline-offset-2 hover:text-blue-900" target="_blank" rel="noreferrer">Uno R3 pinout (A000066)</a></li>
          <li><a href="https://docs.arduino.cc/resources/pinouts/A000005-full-pinout.pdf" className="text-blue-700 underline underline-offset-2 hover:text-blue-900" target="_blank" rel="noreferrer">Nano pinout (A000005)</a></li>
          <li><a href="https://docs.arduino.cc/resources/pinouts/A000067-full-pinout.pdf" className="text-blue-700 underline underline-offset-2 hover:text-blue-900" target="_blank" rel="noreferrer">Mega 2560 Rev3 pinout (A000067)</a></li>
          <li><a href="https://datasheets.raspberrypi.com/pico/Pico-R3-A4-Pinout.pdf" className="text-blue-700 underline underline-offset-2 hover:text-blue-900" target="_blank" rel="noreferrer">Raspberry Pi Pico pinout (R3)</a></li>
        </ul>
      </Section>
    </DocsLayout>
  )
}

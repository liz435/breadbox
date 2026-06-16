import { DocsLayout, PageTitle, Section, Table, Note, Warn } from "@/docs/docs-layout"

export function ArduinoUnoPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Board Targets"
        subtitle="Breadbox supports Uno, Nano, and Mega board targets with board-specific visuals and pin placement."
      />

      <Section title="Supported Boards">
        <Table
          headers={["Board", "MCU", "Compile/Flash FQBN", "Live VM"]}
          rows={[
            ["Arduino Uno R3", "ATmega328P @ 16 MHz", "arduino:avr:uno", "Yes (avr8js)"],
            ["Arduino Nano", "ATmega328P @ 16 MHz", "arduino:avr:nano", "Yes (avr8js-compatible mapping)"],
            ["Arduino Mega 2560 Rev3", "ATmega2560 @ 16 MHz", "arduino:avr:mega", "Compile/flash only"],
          ]}
        />
      </Section>

      <Section title="Pin Mapping in Breadbox">
        <Table
          headers={["Category", "Fully simulated pins", "Visual-only pins"]}
          rows={[
            ["Digital", "D0–D53 on Mega, D0–D13 on Uno/Nano", "None"],
            ["Analog", "A0–A5 on all targets", "Nano A6/A7 and Mega A6–A15 are wireable but not VM-simulated"],
            ["Power", "5V, 3V3, GND, VIN, RESET, AREF, IOREF (where present)", "NC pins"],
          ]}
        />
        <Note>
          Extra Nano/Mega pins are now interactive for wiring/compile flows. The in-browser live VM still
          executes the common Uno-compatible subset.
        </Note>
      </Section>

      <Section title="Board-Specific Header Layouts">
        <Table
          headers={["Board", "Header style in canvas", "Notes"]}
          rows={[
            ["Uno", "Top digital header + bottom power/analog headers", "Matches classic Uno R3 board shape"],
            ["Nano", "Dual side headers (15 per side)", "Pins ordered like official Nano pinout (USB-at-top orientation)"],
            ["Mega 2560", "Top D0–D21 + lower D22–D53 + analog/power headers", "All shown Mega digital headers are interactive"],
          ]}
        />
      </Section>

      <Section title="Electrical Safety Reminder">
        <Warn>
          Board selection changes compile target and board pin geometry. It does <strong>not</strong> increase
          safe current per pin. Use external supplies for servos/motors/high LED counts and always share GND.
        </Warn>
      </Section>

      <Section title="Official References">
        <p className="text-sm text-foreground leading-relaxed mb-2">
          Pin names and header ordering are based on the official Arduino pinout references:
        </p>
        <ul className="list-disc pl-5 text-sm text-foreground space-y-1">
          <li><a href="https://docs.arduino.cc/resources/pinouts/A000066-full-pinout.pdf" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noreferrer">Uno R3 pinout (A000066)</a></li>
          <li><a href="https://docs.arduino.cc/resources/pinouts/A000005-full-pinout.pdf" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noreferrer">Nano pinout (A000005)</a></li>
          <li><a href="https://docs.arduino.cc/resources/pinouts/A000067-full-pinout.pdf" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noreferrer">Mega 2560 Rev3 pinout (A000067)</a></li>
        </ul>
      </Section>
    </DocsLayout>
  )
}

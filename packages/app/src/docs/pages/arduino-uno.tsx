import { DocsLayout, PageTitle, Section, Table, Note, Warn } from "@/docs/docs-layout"

export function ArduinoUnoPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Arduino Uno"
        subtitle="ATmega328P-based microcontroller board. The fixed left-side panel in every project."
      />

      <Section title="Digital Pins (D0 – D13)">
        <Table
          headers={["Pin", "Label", "Special Function", "Notes"]}
          rows={[
            ["D0", "RX", "Serial receive", "Avoid using — conflicts with USB serial upload"],
            ["D1", "TX", "Serial transmit", "Avoid using — conflicts with USB serial upload"],
            ["D2", "2", "External interrupt 0", "INT0 — attach interrupt"],
            ["D3", "~3", "PWM + interrupt 1", "INT1 + 490 Hz PWM"],
            ["D4", "4", "—", "General purpose digital I/O"],
            ["D5", "~5", "PWM", "980 Hz PWM"],
            ["D6", "~6", "PWM", "980 Hz PWM"],
            ["D7", "7", "—", "General purpose digital I/O"],
            ["D8", "8", "—", "General purpose digital I/O"],
            ["D9", "~9", "PWM", "490 Hz PWM"],
            ["D10", "~10", "PWM + SS", "490 Hz PWM, SPI slave select"],
            ["D11", "~11", "PWM + MOSI", "490 Hz PWM, SPI data out"],
            ["D12", "12", "MISO", "SPI data in"],
            ["D13", "13", "Built-in LED", "On-board LED — active HIGH"],
          ]}
        />
        <Note>
          Pins marked <strong>~</strong> support <code>analogWrite()</code> (PWM). Required for servos,
          LED fading, and motor speed control.
        </Note>
      </Section>

      <Section title="Analog Pins (A0 – A5)">
        <Table
          headers={["Pin", "Analog #", "Digital Alias", "Notes"]}
          rows={[
            ["A0", "0", "D14", "10-bit ADC (0–1023)"],
            ["A1", "1", "D15", "10-bit ADC"],
            ["A2", "2", "D16", "10-bit ADC"],
            ["A3", "3", "D17", "10-bit ADC"],
            ["A4", "4", "D18", "10-bit ADC + I²C SDA"],
            ["A5", "5", "D19", "10-bit ADC + I²C SCL"],
          ]}
        />
        <Note>
          Use <code>analogRead(A0)</code> to read sensor values (0 = 0V, 1023 = 5V).
          Analog pins can also be used as digital I/O with <code>pinMode(A0, OUTPUT)</code>.
        </Note>
      </Section>

      <Section title="Power Pins">
        <Table
          headers={["Pin", "Voltage", "Max Current", "Use"]}
          rows={[
            ["5V", "5.0 V", "500 mA (USB)", "Power supply for most components"],
            ["3.3V", "3.3 V", "50 mA", "3.3V sensors and modules"],
            ["GND", "0 V (ground)", "—", "Common ground — connect all component negatives here"],
            ["VIN", "7–12 V", "—", "External power input (not available in simulator)"],
          ]}
        />
        <Warn>
          The 5V pin is limited to ~500 mA over USB. Servos and motors may need an external power supply.
        </Warn>
      </Section>

      <Section title="In Dreamer">
        <p className="text-sm text-gray-300 leading-relaxed mb-2">
          The Arduino Uno is rendered as a fixed left panel on the breadboard — it is not a placeable component.
          Its pins appear as labeled holes you can wire directly from the breadboard.
        </p>
        <Table
          headers={["Simulator Feature", "Status"]}
          rows={[
            ["5V and GND rails as voltage sources", "Implemented — used as SPICE voltage nodes"],
            ["Digital pin HIGH/LOW states (from sketch)", "Implemented — drives LED brightness simulation"],
            ["PWM output (analogWrite)", "Implemented — modeled as fractional voltage"],
            ["analogRead from sensors", "Not yet implemented — ADC not wired to simulation"],
            ["Serial.print / Serial.read", "Not yet implemented — Serial Monitor is a placeholder"],
            ["Interrupts", "Not yet implemented"],
          ]}
        />
      </Section>

      <Section title="Datasheet">
        <Table
          headers={["Parameter", "Value"]}
          rows={[
            ["Microcontroller", "ATmega328P"],
            ["Operating voltage", "5 V"],
            ["Input voltage (recommended)", "7–12 V"],
            ["Digital I/O pins", "14 (6 with PWM)"],
            ["Analog input pins", "6 (10-bit)"],
            ["DC current per I/O pin", "40 mA max"],
            ["Flash memory", "32 KB"],
            ["SRAM", "2 KB"],
            ["EEPROM", "1 KB"],
            ["Clock speed", "16 MHz"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}

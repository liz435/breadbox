// Arduino Uno Reference > Under the hood > Clock, crystal, power regulation

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

export function ClockPowerPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "clock-power",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Clock, crystal, power regulation"
        subtitle="The 16 MHz crystal keeps time; the onboard regulators make the rails the ATmega needs."
      />

      <Section title="The crystal">
        <p className="text-sm leading-relaxed">
          Next to the ATmega328P, the small silver can labelled
          "16.000" is a quartz crystal resonator. It's the timebase
          for the entire board — every{" "}
          <code>millis()</code> reading, every PWM period, every
          baud-rate clock ultimately counts ticks of this crystal.
          16 MHz gives the chip ~16 million instructions per second,
          or roughly 62.5 ns per instruction.
        </p>
      </Section>

      <Section title="The two regulators">
        <p className="text-sm leading-relaxed">
          The Uno has two <Term k="voltage-regulator" /> chips near
          the barrel jack. One turns whatever you feed into VIN or
          the barrel jack (7–12 V is the happy range) into a clean
          5 V rail. A second smaller regulator derives 3.3 V from
          that 5 V for the 3V3 pin. When the board is running on USB
          power instead, the USB 5 V bypasses the main regulator and
          feeds the 5 V rail directly.
        </p>

        <Table
          headers={["Source", "5 V rail", "3.3 V rail"]}
          rows={[
            ["USB", "From USB directly", "From 3.3 V regulator"],
            ["VIN / barrel jack", "From main regulator", "From 3.3 V regulator"],
          ]}
        />
      </Section>

      <Section title="Why it matters">
        <p className="text-sm leading-relaxed">
          The 3.3 V regulator on the Uno can only supply about 50 mA
          — fine for a small sensor, not fine for a whole ESP
          module. And the linear 5 V regulator drops the extra
          voltage as heat; powering the Uno from 12 V means the
          regulator has to burn 7 V × (whatever current), which gets
          warm fast. For high-current projects, feed 5 V straight
          into the 5 V pin from an external supply and bypass the
          regulator entirely.
        </p>

        <Note>
          "Feed 5 V into the 5 V pin" only works if your supply is
          actually 5 V and clean. 5.5 V can damage the chip; 4.5 V
          can cause brownouts.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/voltage-regulators",
          "board/power-pins",
          "board/powering",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

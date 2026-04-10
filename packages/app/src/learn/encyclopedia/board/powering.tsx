// Arduino Uno Reference > The board > Powering the Arduino

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function PoweringArduinoPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "powering",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Powering the Arduino"
        subtitle="USB, VIN, the barrel jack — when to use each."
      />

      <Section title="Three ways to deliver power">
        <p className="text-sm leading-relaxed">
          The Uno has three inputs you can push power into. Only{" "}
          <em className="text-gray-200">one</em> should be active at a
          time; the board automatically chooses between USB and the
          barrel jack, so plugging in both at once is safe but
          wasteful.
        </p>

        <Table
          headers={["Input", "Voltage", "Connector", "When to use"]}
          rows={[
            [
              "USB port",
              "5 V",
              "USB Type-B",
              "Programming + power during development. Always the right choice when your sketch is being uploaded or debugged.",
            ],
            [
              "Barrel jack",
              "7 – 12 V",
              "2.1 mm DC plug",
              "Standalone projects, batteries, wall-wart supplies. Routed through the 5V regulator so the board sees a clean 5 V.",
            ],
            [
              "VIN header pin",
              "7 – 12 V",
              "Header pin",
              "The same internal rail as the barrel jack — just exposed as a header pin so you can drive it from a breadboard or external regulator.",
            ],
          ]}
        />

        <Note>
          The 5 V header pin is an <strong>output</strong>, not an
          input. Never connect a power supply to it — that bypasses
          the onboard regulator's protection and can fry the chip.
          Use VIN or the barrel jack for everything over 5 V.
        </Note>
      </Section>

      <Section title="How the regulator works">
        <p className="text-sm leading-relaxed">
          Anything that comes in through the barrel jack or VIN passes
          through the onboard <strong className="text-gray-200">5 V
          linear regulator</strong> (the chunky black TO-220 next to
          the USB port). The regulator drops whatever you feed it down
          to a clean 5 V for the ATmega chip and the 5V header pin.
        </p>
        <p className="text-sm leading-relaxed">
          Two things to know about linear regulators:
        </p>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">They burn off the voltage difference as heat.</strong>{" "}
            If you feed 12 V into VIN and draw 500 mA, the regulator
            has to dissipate <code>(12 − 5) × 0.5 = 3.5 W</code>. That's
            enough to make it uncomfortably hot. Stick closer to 7–9 V
            if you're drawing serious current.
          </li>
          <li>
            <strong className="text-gray-200">Below ~7 V they can't keep up.</strong>{" "}
            If you try to power the board from a 6 V source through
            VIN, the regulator's dropout means the 5 V rail sags
            under load and weird things happen. USB's 5 V bypasses the
            regulator entirely, which is why it works.
          </li>
        </ul>
      </Section>

      <Section title="Current limits">
        <p className="text-sm leading-relaxed">
          This is the part that bites beginners. The Uno has three
          separate current limits and you need to respect all of them:
        </p>

        <Table
          headers={["Limit", "Value", "What hits it"]}
          rows={[
            ["Per digital pin", "20 mA recommended (40 mA absolute)", "Driving an LED directly, pulling a line up"],
            ["Per pin group", "100 mA total", "Driving a row of LEDs from adjacent pins"],
            ["Chip total", "200 mA", "Every pin output plus every INPUT_PULLUP plus the ATmega itself"],
            ["5V pin (USB-powered)", "~500 mA", "Anything you power from the 5V header"],
          ]}
        />

        <Warn>
          A single LED without a series resistor draws more than 20 mA
          at 5 V. Multiple LEDs on adjacent pins without resistors
          will blow past the pin-group limit. Anything that draws
          more than about 20 mA — motors, large LED strips, relays —
          needs its <Term k="led">own power path</Term>, not the
          Arduino's 5 V rail.
        </Warn>
      </Section>

      <Section title="Picking a supply">
        <p className="text-sm leading-relaxed">
          A decision tree for the common cases:
        </p>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">You're at your desk with a laptop.</strong>{" "}
            USB. Always USB. It's 5 V regulated, it's stable, and it
            doubles as your upload path.
          </li>
          <li>
            <strong className="text-gray-200">The project needs to run standalone.</strong>{" "}
            A 9 V barrel-jack wall adapter is the lazy default. You
            give up uploading until you replug USB, but the board runs
            fine.
          </li>
          <li>
            <strong className="text-gray-200">You want battery power.</strong>{" "}
            A 9 V battery into the barrel jack will work for short
            runs but the regulator is wasteful — you'll drain the
            battery faster than the LEDs need. For real battery
            projects, step up to a board with a switching regulator
            (like a Nano 33 IoT) or add one yourself.
          </li>
          <li>
            <strong className="text-gray-200">You're powering high-current loads.</strong>{" "}
            Use a separate supply for the load. Share ground between
            the two supplies so the Arduino can still signal the
            load's driver (transistor, relay, motor driver), but don't
            pull the load's current through the Arduino.
          </li>
        </ul>
      </Section>

      <SeeAlso
        refs={[
          "board/anatomy",
          "board/power-pins",
          "electronics/power",
          "electronics/ground",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

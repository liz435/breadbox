// Electronics Fundamentals > Components > Transistors

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function TransistorsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "transistors",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Transistors"
        subtitle="An electronically-controlled switch — the component you reach for when an Arduino pin can't push enough current on its own."
      />

      <Section title="Why you need one">
        <p className="text-sm leading-relaxed">
          An Arduino digital pin can deliver about 20 mA safely.
          That's enough for a single LED through a resistor, and
          nothing else. A small motor wants hundreds of
          milliamps. An LED strip wants several amps. A relay
          coil wants 50–100 mA. Wire any of those to a pin
          directly and you'll damage the microcontroller.
        </p>

        <p className="text-sm leading-relaxed">
          A <Term k="transistor" /> fixes this. It has three
          legs. Two of them carry the load current (the big
          current through the motor or LEDs). The third is the
          control leg — a tiny signal from the Arduino decides
          whether the big current flows or not. The Arduino
          never touches the load; it just tells the transistor
          what to do.
        </p>
      </Section>

      <Section title="BJTs and MOSFETs">
        <p className="text-sm leading-relaxed">
          There are two families you'll meet on a hobby bench.
          The bipolar junction transistor (BJT, e.g. 2N2222,
          BC547) is current-controlled — its control leg is
          called the base, and the base current is roughly the
          collector current divided by the transistor's gain.
          The <Term k="mosfet" /> is voltage-controlled — its
          control leg is called the gate, and what matters is
          simply whether the gate voltage exceeds a threshold.
          For switching DC loads from a microcontroller, the
          MOSFET is almost always the better pick: no base
          resistor calculation, and vastly lower losses when
          it's on.
        </p>

        <Table
          headers={["Family", "Control leg", "Other two", "Good for"]}
          rows={[
            ["BJT (NPN)", "Base", "Collector, Emitter", "Small signal, simple switching"],
            [
              "MOSFET (N-channel, logic-level)",
              "Gate",
              "Drain, Source",
              "Switching DC loads from 5 V logic",
            ],
          ]}
        />
      </Section>

      <Section title="Pick a logic-level MOSFET">
        <p className="text-sm leading-relaxed">
          Not every MOSFET turns fully on with 5 V on its gate.
          The datasheet lists a parameter called{" "}
          <em className="text-foreground">VGS(th)</em>, the gate
          threshold, and another called
          <em className="text-foreground">RDS(on)</em>, the
          drain-source resistance when fully on — measured at a
          specific gate voltage. For Arduino duty, look for a
          part that specifies RDS(on) at VGS = 4.5 V. Anything
          labelled "logic-level" or "LL" meets this.
          Non-logic-level MOSFETs will conduct partially at 5 V
          and get hot.
        </p>

        <Note>
          A relay is the other way to switch a big load. See the
          relays page — it's the right choice when you need
          galvanic isolation or you're switching AC.
        </Note>

        <Figure caption="Low-side switch: the Arduino pin drives the gate, and the MOSFET gates current through the load to ground.">
          <Schematic cols={14} rows={9}>
            <Schematic.Vcc at={[8, 1]} label="+V" />
            <Schematic.Wire points={[[8, 1], [8, 2]]} />
            <Schematic.Resistor from={[8, 2]} to={[8, 3]} label="220Ω" />
            <Schematic.Wire points={[[8, 3], [8, 4]]} />
            {/* NMOS — drain at [8,4], source at [8,8], gate at [6,6] */}
            <Schematic.Nmos at={[8, 6]} label="M1" />
            <Schematic.ArduinoPin at={[4, 6]} pin="D9" />
            <Schematic.Wire points={[[4, 6], [6, 6]]} />
            <Schematic.Ground at={[8, 8]} />
          </Schematic>
        </Figure>
      </Section>

      <SeeAlso
        refs={[
          "electronics/current-limits",
          "electronics/relays",
          "electronics/diodes",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

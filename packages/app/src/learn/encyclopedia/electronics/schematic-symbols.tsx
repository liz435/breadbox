// Schematic symbols reference page — Electronics Fundamentals > Practical.
//
// This page does three things:
//   1. Teaches the reader what each schematic symbol means.
//   2. Serves as a visual regression reference for the <Schematic> DSL
//      itself — if a symbol's SVG breaks, it shows up here first.
//   3. Acts as the proof-of-life page for Milestone 0 of the
//      encyclopedia build (see ENCYCLOPEDIA_TODO.md). Every other
//      encyclopedia entry is "planned" until its content lands.

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function SchematicSymbolsPage() {
  // Resolve this page's own catalog entry so the prev/next footer works.
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "schematic-symbols",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Reading a schematic"
        subtitle="Every symbol the encyclopedia uses, in one place."
      />

      <Section title="Why schematics?">
        <p className="text-sm leading-relaxed">
          A schematic shows a circuit's{" "}
          <em className="text-gray-200">electrical structure</em> — what is
          connected to what — without committing to where the parts sit on
          a real board. A breadboard view shows you{" "}
          <em className="text-gray-200">physical placement</em>. You need
          both mental models, and this page teaches the first one.
        </p>
        <Note>
          Every symbol below is rendered by Breadbox's own{" "}
          <code className="text-gray-200">&lt;Schematic&gt;</code>{" "}
          component. If a symbol ever looks broken, it'll break here
          first, which is why this page doubles as a visual regression
          target.
        </Note>
      </Section>

      <Section title="Wires and junctions">
        <p className="text-sm leading-relaxed">
          Wires connect components. A solid line is a conductor. A{" "}
          <em className="text-gray-200">junction dot</em> where three or
          more wires meet means they are electrically joined; if there's
          no dot, the wires are crossing over without touching.
        </p>
        <Figure caption="Left: a junction (joined). Right: a crossing (not touching).">
          <Schematic cols={9} rows={4}>
            {/* Junction on the left: one vertical + one horizontal + dot */}
            <Schematic.Wire points={[[2, 1], [2, 3]]} />
            <Schematic.Wire points={[[1, 2], [3, 2]]} />
            <Schematic.Junction at={[2, 2]} />
            {/* Crossing on the right: same geometry, no dot */}
            <Schematic.Wire points={[[6, 1], [6, 3]]} />
            <Schematic.Wire points={[[5, 2], [7, 2]]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="Power and ground">
        <p className="text-sm leading-relaxed">
          Rather than drawing wires all the way back to a battery, a{" "}
          <em className="text-gray-200">Vcc</em> stub marks "this point is
          at the supply voltage" and a{" "}
          <em className="text-gray-200">ground</em> symbol marks "this
          point is at 0 V." Any two points with the same power or ground
          symbol are implicitly connected.
        </p>
        <Figure caption="Left to right: Vcc marker, battery, ground symbol.">
          <Schematic cols={10} rows={4}>
            <Schematic.Vcc at={[2, 2]} label="+5V" />
            <Schematic.Battery at={[5, 2]} label="Battery" />
            <Schematic.Ground at={[8, 2]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="Passive components">
        <p className="text-sm leading-relaxed">
          Passive components don't need power to do their job. The three
          you'll meet first:
        </p>
        <Figure caption="Resistor, capacitor, LED — connected in a line.">
          <Schematic cols={12} rows={4}>
            <Schematic.Wire points={[[0, 2], [1, 2]]} />
            <Schematic.Resistor from={[1, 2]} to={[5, 2]} label="220Ω" />
            <Schematic.Wire points={[[5, 2], [6, 2]]} />
            <Schematic.Capacitor from={[6, 2]} to={[8, 2]} label="0.1µF" />
            <Schematic.Wire points={[[8, 2], [9, 2]]} />
            <Schematic.Led from={[9, 2]} to={[11, 2]} label="LED" />
            <Schematic.Wire points={[[11, 2], [12, 2]]} />
          </Schematic>
        </Figure>
        <p className="text-sm leading-relaxed">
          The LED symbol points from anode (positive, left) to cathode
          (negative, right). The bar on the cathode side matches the flat
          edge on a real LED's plastic rim, and the two small arrows
          indicate light coming out.
        </p>
      </Section>

      <Section title="Switches and buttons">
        <p className="text-sm leading-relaxed">
          A momentary push button is drawn as two contacts with a
          hover-bar above them. Pressing the button slams the bar down
          onto the contacts and closes the circuit.
        </p>
        <Figure caption="A momentary SPST push button between two wires.">
          <Schematic cols={8} rows={4}>
            <Schematic.Wire points={[[0, 2], [2, 2]]} />
            <Schematic.Button from={[2, 2]} to={[6, 2]} label="SW1" />
            <Schematic.Wire points={[[6, 2], [8, 2]]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="Arduino pins">
        <p className="text-sm leading-relaxed">
          When a wire leaves the circuit to connect to the Arduino, we
          show the destination as a small labeled box instead of drawing
          the whole board. This keeps the schematic focused on what you
          care about — your circuit — and out of the way of the Uno's 30+
          pins.
        </p>
        <Figure caption="D13 driving an LED through a 220Ω resistor to ground.">
          <Schematic cols={12} rows={5}>
            <Schematic.ArduinoPin at={[2, 2]} pin="D13" />
            <Schematic.Wire points={[[2, 2], [3, 2]]} />
            <Schematic.Resistor from={[3, 2]} to={[7, 2]} label="220Ω" />
            <Schematic.Wire points={[[7, 2], [8, 2]]} />
            <Schematic.Led from={[8, 2]} to={[10, 2]} />
            <Schematic.Wire points={[[10, 2], [10, 4]]} />
            <Schematic.Ground at={[10, 4]} />
          </Schematic>
        </Figure>
      </Section>

      <Section title="A complete example">
        <p className="text-sm leading-relaxed">
          Everything in one circuit — the blink-LED lesson, drawn as a
          schematic. Pin 13 drives current through a 220 Ω resistor into
          the LED's anode; the cathode returns to ground.
        </p>
        <Figure caption="Blink-LED, schematic form.">
          <Schematic cols={12} rows={6}>
            <Schematic.ArduinoPin at={[2, 2]} pin="D13" />
            <Schematic.Wire points={[[2, 2], [3, 2]]} />
            <Schematic.Resistor from={[3, 2]} to={[7, 2]} label="220Ω" />
            <Schematic.Wire points={[[7, 2], [8, 2]]} />
            <Schematic.Led from={[8, 2]} to={[10, 2]} color="#ef4444" label="LED1" />
            <Schematic.Wire points={[[10, 2], [10, 4]]} />
            <Schematic.Ground at={[10, 4]} />
          </Schematic>
        </Figure>
        <p className="text-sm leading-relaxed">
          Notice how much smaller this is than the breadboard view for
          the same circuit. Schematics ignore physical layout and focus
          on electrical structure — which is exactly what you want when
          you're trying to understand what a circuit does.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "electronics/breadboards",
          "electronics/leds",
          "electronics/resistors",
          "board/digital-pins",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

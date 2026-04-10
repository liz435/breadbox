// Electronics Fundamentals > Components > Wires and jumpers

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

export function WiresPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "wires",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Wires and jumpers"
        subtitle="Small differences in wire style that make a big difference in practice."
      />

      <Section title="Solid vs stranded">
        <p className="text-sm leading-relaxed">
          A wire's metal core comes in two shapes:
        </p>

        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">Solid core</strong> is a
            single stiff strand of copper. It holds its shape, plugs
            cleanly into breadboard holes, and is the right choice for
            anything that lives on a breadboard.
          </li>
          <li>
            <strong className="text-gray-200">Stranded</strong> is made
            of dozens of thin strands bundled inside the insulation. It
            bends easily and won't snap after repeated flexing, but
            it's hard to push into a breadboard hole and a stray strand
            can short to a neighboring row.
          </li>
        </ul>

        <Note>
          For Arduino work, buy pre-cut jumper wire packs (the "M/M"
          variety) in solid core. They come with the right stripped
          length for a breadboard and in every color of the rainbow.
        </Note>
      </Section>

      <Section title="Color conventions">
        <p className="text-sm leading-relaxed">
          There's no law about wire colors, but nearly every project
          follows the same convention so a stranger can glance at a
          circuit and know what's what:
        </p>

        <Table
          headers={["Color", "Role"]}
          rows={[
            ["Red", "Positive power (5V, VIN, or VCC)"],
            ["Black", "Ground (GND) — always black if available"],
            ["Yellow / orange", "Signal lines (digital or analog I/O)"],
            ["Green", "Specialty signals (often I²C data or servo signal)"],
            ["White / blue", "Any other signal, UART, or chip select"],
          ]}
        />

        <p className="text-sm leading-relaxed mt-2">
          You'll save yourself hours of debugging by sticking to at
          least the red-and-black rule. Any wire carrying ground should
          always be black; any wire carrying positive power should
          always be red.
        </p>
      </Section>

      <Section title="Jumper types">
        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          <li>
            <strong className="text-gray-200">Male-to-male (M/M)</strong>{" "}
            — the everyday breadboard jumper. Both ends are pins.
          </li>
          <li>
            <strong className="text-gray-200">Male-to-female (M/F)</strong>{" "}
            — for connecting breadboards to modules that have female
            header sockets.
          </li>
          <li>
            <strong className="text-gray-200">Female-to-female (F/F)</strong>{" "}
            — for pin-to-pin on module headers, no breadboard involved.
          </li>
        </ul>
      </Section>

      <SeeAlso
        refs={[
          "electronics/breadboards",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

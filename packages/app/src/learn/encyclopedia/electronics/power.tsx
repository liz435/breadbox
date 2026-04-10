// Electronics Fundamentals > Core concepts > Power and current limits

import {
  LearnLayout,
  PageTitle,
  Section,
  Warn,
  Note,
  Table,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function PowerPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "power",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Power and current limits"
        subtitle="Why components heat up, and why Arduino pins have a cap."
      />

      <Section title="The equation">
        <p className="text-sm leading-relaxed">
          Electrical power is what turns into heat (or light, or motion)
          when current flows through a component. It's measured in watts
          and follows a one-line formula:
        </p>

        <p className="my-3 text-center text-lg font-mono text-gray-100">
          P = V × I
        </p>

        <p className="text-sm leading-relaxed">
          Power equals voltage multiplied by current. A 5 V supply
          pushing 20 mA through a resistor delivers 5 × 0.020 = 0.1 W
          to that resistor. All of that becomes heat.
        </p>
      </Section>

      <Section title="Why components heat up">
        <p className="text-sm leading-relaxed">
          Any component that resists current flow turns the electrical
          energy it opposes into heat. A resistor does this on purpose.
          A wire does it accidentally (but a tiny amount, because its
          resistance is nearly zero). A motor does it when stalled.
          Enough heat and things melt, smoke, or catch fire — which is
          why each component has a power rating.
        </p>
      </Section>

      <Section title="Resistor power ratings">
        <p className="text-sm leading-relaxed">
          The small axial resistors in an Arduino kit are typically
          rated for <strong className="text-gray-200">¼ watt</strong>.
          That's plenty for low-voltage hobby work — even a 5 V supply
          through a 100 Ω resistor only dissipates 0.25 W, right at the
          limit. Keep well under the rating for safety.
        </p>

        <Table
          headers={["Resistor size", "Power rating"]}
          rows={[
            ["1/8 W (small)", "0.125 W"],
            ["1/4 W (standard kit)", "0.25 W"],
            ["1/2 W", "0.5 W"],
            ["1 W", "1 W"],
          ]}
        />
      </Section>

      <Section title="Arduino pin current limits">
        <p className="text-sm leading-relaxed">
          An Arduino Uno pin is not an unlimited power source. Each
          individual digital pin can handle:
        </p>

        <Table
          headers={["Limit", "Value"]}
          rows={[
            ["Safe continuous current per pin", "20 mA"],
            ["Absolute max current per pin", "40 mA"],
            ["Max combined current across all pins", "200 mA"],
            ["Max current from 5V pin", "~500 mA (USB powered)"],
            ["Max current from 3V3 pin", "50 mA"],
          ]}
        />

        <Warn>
          Drawing more than 40 mA from a pin can permanently damage the
          ATmega328P. If you need to drive a motor, a coil, or a bright
          LED chain, use a transistor — the pin drives the transistor,
          the transistor drives the load from a bigger supply.
        </Warn>

        <Note>
          The "20 mA safe, 40 mA absolute" rule is why nearly every LED
          circuit lands on a resistor that produces roughly 15 mA — it's
          well inside the safe range and leaves margin for component
          variation.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/power-pins",
          "board/powering",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}
